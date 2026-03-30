import { createAdminClient } from "@/shared/lib/supabase/admin";

/** Kurz-Hilfe für API-JSON, wenn Env + DB leer bleiben. */
export const INTEGRATION_SECRETS_CONFIGURATION_HINT_DE =
  "Werte entweder als Environment Variables im Host (z. B. Vercel) setzen oder in der Supabase-Tabelle public.integration_secrets (Spalten key/value; key exakt wie der Variablenname, z. B. OTTO_API_CLIENT_ID). " +
  "Secrets unter Supabase → Edge Functions ersetzen diese Tabelle nicht. Zum Auslesen der Tabelle braucht die App SUPABASE_SERVICE_ROLE_KEY und NEXT_PUBLIC_SUPABASE_URL in Vercel (echter Service-Role-Key, nicht der Anon-Key).";

export type ReadIntegrationSecretResult = {
  value: string;
  /** PostgREST/Netzwerk-Fehler beim Lesen der Zeile (nicht „Zeile fehlt“). */
  databaseError?: string;
};

/**
 * Liest einen Wert: zuerst process.env[key], sonst integration_secrets.value für dieselbe key.
 */
export async function readIntegrationSecret(key: string): Promise<ReadIntegrationSecretResult> {
  const fromEnv = (process.env[key] ?? "").trim();
  if (fromEnv) return { value: fromEnv };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("integration_secrets")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.error(`[integration_secrets] ${key}:`, error.message);
      return { value: "", databaseError: error.message };
    }
    const v = typeof data?.value === "string" ? data.value.trim() : "";
    return { value: v };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[integration_secrets] ${key} exception:`, msg);
    return { value: "", databaseError: msg };
  }
}

/** Kompatibel zu älterem getSupabaseSecret: nur der Wert, Fehler nur in den Logs. */
export async function getIntegrationSecretValue(key: string): Promise<string> {
  const r = await readIntegrationSecret(key);
  return r.value;
}
