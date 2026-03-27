import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { type Role } from "@/shared/lib/invitations";

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
  if (
    value === "owner" ||
    value === "admin" ||
    value === "manager" ||
    value === "analyst" ||
    value === "viewer"
  ) {
    return value;
  }
  return null;
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
  return user;
}

function isOwnerRole(user: {
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}) {
  const appRole = user.app_metadata?.role;
  const userRole = user.user_metadata?.role;
  return appRole === "owner" || userRole === "owner";
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!isOwnerRole(user)) {
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
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!isOwnerRole(user)) {
    return NextResponse.json(
      { error: "Nur Owner dürfen Einladungen versenden." },
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
  const appName = "Master Dashboard";

  const admin = createAdminClient();
  const invitePayload: InvitationInsert = {
    email,
    role,
    token,
    status: "pending",
    invited_by: user.id,
    expires_at: expiresAt,
  };

  const { data, error } = await admin
    .from("invitations")
    .insert(invitePayload)
    .select("id,email,role,status,created_at,expires_at")
    .single();

  if (error) {
    const details = process.env.NODE_ENV !== "production" ? error.message : undefined;
    return NextResponse.json(
      {
        error:
          "Einladung konnte nicht gespeichert werden. Bitte prüfe die Supabase-Tabelle 'invitations'.",
        details,
      },
      { status: 500 }
    );
  }

  // Legt einen echten Benutzer in auth.users an und versendet eine echte Supabase-Einladung.
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteUrl,
    data: {
      role,
      invited_by: user.id,
      invite_token: token,
    },
  });

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
