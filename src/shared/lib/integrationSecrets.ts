import { createAdminClient } from "@/shared/lib/supabase/admin";

/** Kurz-Hilfe für API-JSON, wenn Env + DB leer bleiben. */
export const INTEGRATION_SECRETS_CONFIGURATION_HINT_DE =
  "Werte entweder als Environment Variables im Host (z. B. Vercel) setzen oder in der Supabase-Tabelle public.integration_secrets (Spalten key/value; key exakt wie der Variablenname, z. B. OTTO_API_CLIENT_ID). " +
  "Secrets unter Supabase → Edge Functions ersetzen diese Tabelle nicht. Zum Auslesen der Tabelle braucht die App SUPABASE_SERVICE_ROLE_KEY und NEXT_PUBLIC_SUPABASE_URL in Vercel (echter Service-Role-Key, nicht der Anon-Key).";

export type ReadIntegrationSecretResult = {
  value: string;
  /** PostgREST/Netzwerk-Fehler beim Lesen der Zeile (nicht „Zeile fehlt"). */
  databaseError?: string;
};

// ---------------------------------------------------------------------------
// In-Memory Cache — verhindert wiederholte DB-Queries für dieselben Secrets.
// Vorher: JEDER API-Call las 10+ Secrets aus Supabase (104 Stellen).
// Amazon-Sales allein = 10 DB-Roundtrips pro Request.
// Jetzt: Erste Anfrage → DB, danach 5 Minuten aus Memory.
// ---------------------------------------------------------------------------

const SECRETS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minuten

const _secretsCache = new Map<
  string,
  { value: string; databaseError?: string; expiresAt: number }
>();

/**
 * Liest einen Wert: zuerst Memory-Cache, dann process.env[key], zuletzt integration_secrets DB.
 */
export async function readIntegrationSecret(key: string): Promise<ReadIntegrationSecretResult> {
  // 1. Memory-Cache (schnellster Pfad)
  const cached = _secretsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { value: cached.value, databaseError: cached.databaseError };
  }

  // 2. Environment-Variable (kein DB-Hit nötig)
  const fromEnv = (process.env[key] ?? "").trim();
  if (fromEnv) {
    _secretsCache.set(key, { value: fromEnv, expiresAt: Date.now() + SECRETS_CACHE_TTL_MS });
    return { value: fromEnv };
  }

  // 3. Supabase DB (nur wenn nicht im Cache und nicht in Env)
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("integration_secrets")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.error(`[integration_secrets] ${key}:`, error.message);
      // Auch Fehler cachen (kurz) — verhindert DB-Bombardement bei Supabase-Problemen
      _secretsCache.set(key, {
        value: "",
        databaseError: error.message,
        expiresAt: Date.now() + 30_000, // 30s bei Fehler
      });
      return { value: "", databaseError: error.message };
    }
    const v = typeof data?.value === "string" ? data.value.trim() : "";
    _secretsCache.set(key, { value: v, expiresAt: Date.now() + SECRETS_CACHE_TTL_MS });
    return { value: v };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[integration_secrets] ${key} exception:`, msg);
    // Fehler kurz cachen — verhindert Retry-Sturm bei Supabase-Down
    _secretsCache.set(key, {
      value: "",
      databaseError: msg,
      expiresAt: Date.now() + 30_000,
    });
    return { value: "", databaseError: msg };
  }
}

/** Kompatibel zu älterem getSupabaseSecret: nur der Wert, Fehler nur in den Logs. */
export async function getIntegrationSecretValue(key: string): Promise<string> {
  const r = await readIntegrationSecret(key);
  return r.value;
}

/**
 * Batch-Lesen: Lädt mehrere Secrets in einer einzigen DB-Query statt N einzelnen.
 * getFlexIntegrationConfig liest 8–11 Keys → vorher 8–11 Queries, jetzt 1.
 * Keys die im Memory-Cache oder process.env vorhanden sind, werden nicht abgefragt.
 */
export async function readIntegrationSecretsBatch(
  keys: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const needDb: string[] = [];

  for (const key of keys) {
    // 1. Memory-Cache
    const cached = _secretsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      result.set(key, cached.value);
      continue;
    }
    // 2. Environment Variable
    const fromEnv = (process.env[key] ?? "").trim();
    if (fromEnv) {
      _secretsCache.set(key, { value: fromEnv, expiresAt: Date.now() + SECRETS_CACHE_TTL_MS });
      result.set(key, fromEnv);
      continue;
    }
    needDb.push(key);
  }

  if (needDb.length === 0) return result;

  // 3. Einzelne DB-Query für alle fehlenden Keys
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("integration_secrets")
      .select("key,value")
      .in("key", needDb);
    if (error) {
      console.error("[integration_secrets] batch:", error.message);
      for (const key of needDb) {
        _secretsCache.set(key, {
          value: "",
          databaseError: error.message,
          expiresAt: Date.now() + 30_000,
        });
        result.set(key, "");
      }
      return result;
    }
    const dbRows = new Map<string, string>();
    if (Array.isArray(data)) {
      for (const row of data as Array<{ key: string; value: unknown }>) {
        const v = typeof row.value === "string" ? row.value.trim() : "";
        dbRows.set(row.key, v);
      }
    }
    for (const key of needDb) {
      const v = dbRows.get(key) ?? "";
      _secretsCache.set(key, { value: v, expiresAt: Date.now() + SECRETS_CACHE_TTL_MS });
      result.set(key, v);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[integration_secrets] batch exception:", msg);
    for (const key of needDb) {
      _secretsCache.set(key, { value: "", databaseError: msg, expiresAt: Date.now() + 30_000 });
      result.set(key, "");
    }
  }

  return result;
}
