import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertSupabasePublicEnv, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/shared/lib/supabase/env";

export async function createClient() {
  assertSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // In Server Components koennen Cookie-Schreibvorgaenge fehlschlagen.
            // Middleware/Route-Handler uebernehmen in dem Fall die Session-Synchronisierung.
          }
        },
      },
    }
  );
}
