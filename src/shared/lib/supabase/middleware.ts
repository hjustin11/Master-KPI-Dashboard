import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { assertSupabasePublicEnv, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/shared/lib/supabase/env";

export function updateSession(request: NextRequest) {
  assertSupabasePublicEnv();
  const response = NextResponse.next({ request });

  createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  return response;
}
