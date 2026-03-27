import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/shared/lib/supabase/env";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const publicPaths = ["/login", "/register", "/forgot-password", "/auth/callback", "/auth/reset"];
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );
  const isAuthPageThatShouldRedirectWhenLoggedIn =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/forgot-password");
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Wenn eingeloggt: normale Auth-Seiten (Login/Forgot) wegredirecten,
  // aber Invite-Abschluss (/register) und Reset (/auth/reset) erlauben.
  if (isPublicPath && user && isAuthPageThatShouldRedirectWhenLoggedIn) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!user) {
    if (isPublicPath) {
      return response;
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|robots.txt|sitemap.xml).*)",
  ],
};
