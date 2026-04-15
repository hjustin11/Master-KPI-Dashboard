import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Globaler Supabase-Timeout (ms) für alle Admin-Requests.
 * Verhindert, dass die Seite 99+ Sekunden blockiert wenn Supabase nicht erreichbar ist.
 */
const SUPABASE_GLOBAL_TIMEOUT_MS = 15_000;

/**
 * Singleton: Ein einziger Admin-Client wird wiederverwendet.
 * Vorher: Jeder Aufruf erzeugte einen neuen Client = neue DB-Connection.
 * Problem: 49+ Stellen rufen createAdminClient() auf → 50–200 gleichzeitige Connections → Supabase crasht.
 * Jetzt: 1 Client, wiederverwendet. Reduziert Connections um ~95%.
 */
let _admin: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (_admin) return _admin;

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  _admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (input, init) => {
        const controller = new AbortController();
        const existingSignal = init?.signal;
        const timeout = setTimeout(() => controller.abort(), SUPABASE_GLOBAL_TIMEOUT_MS);

        // Wenn bereits ein Signal existiert (z.B. von einem übergeordneten AbortController),
        // aborten wenn EINES der beiden Signale feuert.
        if (existingSignal) {
          existingSignal.addEventListener("abort", () => controller.abort(), { once: true });
        }

        return fetch(input, { ...init, signal: controller.signal }).finally(() =>
          clearTimeout(timeout)
        );
      },
    },
  });

  return _admin;
}
