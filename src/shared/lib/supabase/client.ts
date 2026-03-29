import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/shared/lib/supabase/env";

/** Eine Instanz pro Tab — vermeidet parallele Auth-Locks („stole it“) bei mehrfachen createBrowserClient(). */
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}
