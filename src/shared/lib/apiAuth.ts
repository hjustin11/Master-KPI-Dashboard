import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { resolveEffectiveRoleKey } from "@/shared/lib/roles";
import type { Role } from "@/shared/lib/invitations";

/**
 * Einheitlicher Auth-Guard für API-Route-Handler.
 *
 * - Prüft die Supabase-Session.
 * - Holt optional `profiles.role` nach, wenn eine Rollen-Restriktion gesetzt ist.
 * - Liefert einheitliche 401/403-Responses.
 *
 * Nutzung:
 * ```ts
 * export const GET = withAuth(async ({ user }) => {
 *   return NextResponse.json({ userId: user.id });
 * });
 *
 * export const POST = withAuth(async ({ user, role, req }) => {
 *   // ...
 * }, { requiredRole: ["owner", "admin"] });
 * ```
 *
 * **Nicht für bewusst öffentliche Routen verwenden** (Cron-Warmup, Invitations-Lookup etc.).
 */

export type ApiAuthContext = {
  user: User;
  role: Role;
  /** Bereits erstellter Supabase-Server-Client mit User-Session (für eigene DB-Queries). */
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  req: Request;
};

export type AuthedHandler<TReturn = Response | NextResponse> = (
  ctx: ApiAuthContext,
  routeContext?: unknown
) => Promise<TReturn> | TReturn;

export type WithAuthOptions = {
  /** Erlaubt nur diese Rollen. Default: alle authentifizierten User. */
  requiredRole?: Role[];
  /** Fallback-Rolle, wenn weder DB noch Metadata etwas liefert. Default: `"viewer"`. */
  defaultRole?: Role;
};

function unauthorized() {
  return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Zugriff verweigert." }, { status: 403 });
}

/**
 * Higher-Order: kapselt den Auth-Flow. Der Handler bekommt den authentifizierten User
 * samt effektiver Rolle und einem bereits erstellten Supabase-Client.
 */
export function withAuth<TReturn extends Response | NextResponse>(
  handler: AuthedHandler<TReturn>,
  options: WithAuthOptions = {}
): (req: Request, routeContext?: unknown) => Promise<Response | NextResponse> {
  return async (req: Request, routeContext?: unknown) => {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return unauthorized();
    }

    // Rollen-Auflösung: DB-Profile → app_metadata → user_metadata → Default.
    let profileRole: unknown = undefined;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      profileRole = (data as { role?: unknown } | null)?.role;
    } catch {
      // Wenn `profiles` nicht erreichbar ist: fail-soft, wir fallen auf Metadata zurück.
    }

    const role = resolveEffectiveRoleKey({
      profileRole,
      appRole: (user.app_metadata as { role?: unknown } | null)?.role,
      userRole: (user.user_metadata as { role?: unknown } | null)?.role,
      fallback: options.defaultRole ?? "viewer",
    });

    if (options.requiredRole && options.requiredRole.length > 0) {
      if (!options.requiredRole.includes(role)) {
        return forbidden();
      }
    }

    return handler({ user, role, supabase, req }, routeContext);
  };
}

/**
 * Variante für Bearer-Token-Authentifizierung (z. B. Cron-Routen).
 * Prüft `Authorization: Bearer <token>` gegen eine der mitgegebenen Secrets.
 */
export function withBearerAuth<TReturn extends Response | NextResponse>(
  handler: (req: Request, routeContext?: unknown) => Promise<TReturn> | TReturn,
  secrets: Array<string | undefined>
): (req: Request, routeContext?: unknown) => Promise<Response | NextResponse> {
  const allowed = secrets.filter((s): s is string => typeof s === "string" && s.length > 0);
  return async (req: Request, routeContext?: unknown) => {
    if (allowed.length === 0) {
      // Fail-closed in Prod: wenn kein Secret gesetzt ist, weisen wir ab.
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Nicht konfiguriert." }, { status: 503 });
      }
      // In Dev: durchreichen.
      return handler(req, routeContext);
    }
    const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
    const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    if (!token || !allowed.includes(token)) {
      return unauthorized();
    }
    return handler(req, routeContext);
  };
}
