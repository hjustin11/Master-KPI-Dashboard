import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { confirmAuthUserEmail } from "@/shared/lib/supabase/confirm-invited-email";
import { type Role } from "@/shared/lib/invitations";
import { normalizeRoleKey } from "@/shared/lib/roles";

type InvitationInsert = {
  email: string;
  role: Role;
  token: string;
  status: "pending" | "accepted";
  invited_by: string;
  expires_at: string;
};

function resolveAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_BASE_URL ??
    "http://localhost:3000"
  );
}

function resolveRole(value: string): Role | null {
  return normalizeRoleKey(value);
}

async function getAuthenticatedUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }
  return { user, supabase };
}

async function isOwnerRole(args: {
  user: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
}) {
  const { user, supabase } = args;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role === "owner") return true;

  // Fallback: falls profiles noch nicht existiert
  const appRole = user.app_metadata?.role;
  const userRole = user.user_metadata?.role;
  return appRole === "owner" || userRole === "owner";
}

export async function GET() {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!(await isOwnerRole(auth))) {
    return NextResponse.json(
      { error: "Nur Owner dürfen Einladungen ansehen." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .select("id,email,role,status,created_at,expires_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        error:
          "Einladungen konnten nicht geladen werden. Stelle sicher, dass die Tabelle 'invitations' existiert.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ invitations: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!(await isOwnerRole(auth))) {
    const details =
      process.env.NODE_ENV !== "production"
        ? {
            profileRole: null,
            appRole: (auth.user.app_metadata?.role as string | undefined) ?? null,
            userRole: (auth.user.user_metadata?.role as string | undefined) ?? null,
          }
        : undefined;
    return NextResponse.json(
      { error: "Nur Owner dürfen Einladungen versenden.", details },
      { status: 403 }
    );
  }

  const body = (await request.json()) as { email?: string; role?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const role = resolveRole(body.role ?? "");

  if (!email || !role) {
    return NextResponse.json(
      { error: "Ungueltige Eingabe. E-Mail und Rolle sind erforderlich." },
      { status: 400 }
    );
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const appBaseUrl = resolveAppBaseUrl();
  const nextPath = `/register?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(
    email
  )}&role=${role}`;
  const inviteUrl = `${appBaseUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const admin = createAdminClient();

  // Wichtig: Viele Setups haben invited_by als FK auf public.profiles.id.
  // Dann muss das Profil des einladenden Users existieren, sonst scheitert der Insert in invitations.
  try {
    const inviterEmail = (auth.user.email ?? "").toLowerCase();
    await admin.from("profiles").upsert(
      {
        id: auth.user.id,
        email: inviterEmail || `${auth.user.id}@local`,
        full_name: (auth.user.user_metadata?.full_name as string | undefined) ?? "",
        role: "owner",
      },
      { onConflict: "id" }
    );
  } catch {
    // Best-effort: Wenn profiles nicht existiert oder RLS anders konfiguriert ist,
    // kann invitations trotzdem funktionieren (z.B. FK zeigt auf auth.users).
  }

  const invitePayload: InvitationInsert = {
    email,
    role,
    token,
    status: "pending",
    invited_by: auth.user.id,
    expires_at: expiresAt,
  };

  const { data, error } = await admin
    .from("invitations")
    .insert(invitePayload)
    .select("id,email,role,status,created_at,expires_at")
    .single();

  if (error) {
    const details = error.message;
    const code = (error as unknown as { code?: string }).code;
    return NextResponse.json(
      {
        error:
          "Einladung konnte nicht gespeichert werden. Bitte prüfe die Supabase-Tabelle 'invitations'.",
        details,
        code,
      },
      { status: 500 }
    );
  }

  // Legt einen echten Benutzer in auth.users an und versendet eine echte Supabase-Einladung.
  const { data: inviteAuth, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteUrl,
    data: {
      role,
      invited_by: auth.user.id,
      invite_token: token,
    },
  });

  if (!inviteError && inviteAuth?.user?.id) {
    await confirmAuthUserEmail(admin, inviteAuth.user.id);
  }

  if (inviteError) {
    const alreadyRegistered =
      inviteError.message.toLowerCase().includes("already") ||
      inviteError.message.toLowerCase().includes("registered");

    if (alreadyRegistered) {
      // Einladung ist praktisch nicht mehr nutzbar, daher entfernen wir die DB-Zeile.
      // (Der User ist bereits in auth registriert und kann den Invite-Link nicht mehr "akzeptieren".)
      try {
        await admin.from("invitations").delete().eq("id", data?.id);
      } catch {
        // Ignore - Einladung liegt evtl. nicht oder kann nicht geloescht werden.
      }

      return NextResponse.json(
        {
          warning:
            "Einladung gespeichert. Die E-Mail ist bereits registriert, daher wurde keine neue Auth-Einladung versendet.",
          invitation: data,
          details: inviteError.message,
        },
        { status: 201 }
      );
    }

    // Bei Rate-Limit oder anderen Versand-Fehlern soll keine "hängende" Pending-Einladung übrig bleiben,
    // sonst blockieren spätere Tests unnötig.
    try {
      await admin.from("invitations").delete().eq("id", data?.id);
    } catch {
      // Ignore - best-effort cleanup.
    }

    const message =
      inviteError.message.toLowerCase().includes("rate limit") ||
      inviteError.message.toLowerCase().includes("rate-limited") ||
      inviteError.message.toLowerCase().includes("email rate limit")
        ? "Supabase hat das E-Mail-Rate-Limit erreicht. Bitte kurz warten und dann erneut versuchen."
        : "Einladung gespeichert, aber Supabase konnte die Einladungs-Mail nicht versenden.";

    return NextResponse.json(
      {
        warning: message,
        invitation: data,
        details: inviteError.message,
      },
      { status: 201 }
    );
  }

  return NextResponse.json(
    {
      invitation: data,
      message: "Einladung gesendet.",
    },
    { status: 201 }
  );
}
