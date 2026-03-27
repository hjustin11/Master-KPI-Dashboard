import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
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
