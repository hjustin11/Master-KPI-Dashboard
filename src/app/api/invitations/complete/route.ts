import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { type Role } from "@/shared/lib/invitations";

function resolveRole(value: unknown): Role | null {
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

async function findAuthUserIdByEmail(email: string) {
  const admin = createAdminClient();
  // Für kleine Teams ausreichend; bei Bedarf später durch invited_user_id in DB ersetzen.
  const perPage = 200;
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const match = data.users?.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
    );
    if (match?.id) return match.id;
    if (!data.users || data.users.length < perPage) break;
  }
  return null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    token?: string;
    email?: string;
    password?: string;
    fullName?: string;
  };

  const token = body.token?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const fullName = body.fullName?.trim() ?? "";

  if (!token || !email || !password || password.trim().length < 6 || fullName.length < 2) {
    return NextResponse.json(
      { error: "Ungueltige Eingabe." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: inviteRow, error: inviteError } = await admin
    .from("invitations")
    .select("id,email,role,status,expires_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteError || !inviteRow) {
    return NextResponse.json({ error: "Einladung nicht gefunden." }, { status: 404 });
  }

  if (inviteRow.status !== "pending") {
    return NextResponse.json({ error: "Einladung wurde bereits verwendet." }, { status: 400 });
  }

  const inviteEmail = String(inviteRow.email ?? "").toLowerCase();
  if (!inviteEmail || inviteEmail !== email) {
    return NextResponse.json({ error: "E-Mail passt nicht zur Einladung." }, { status: 403 });
  }

  const expiresAt = new Date(inviteRow.expires_at as string).getTime();
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    return NextResponse.json({ error: "Einladung ist abgelaufen." }, { status: 400 });
  }

  const role = resolveRole(inviteRow.role);
  if (!role) {
    return NextResponse.json({ error: "Ungueltige Rolle in Einladung." }, { status: 400 });
  }

  let userId = await findAuthUserIdByEmail(email);
  if (!userId) {
    // Falls die Einladung z.B. manuell in public.invitations angelegt wurde, existiert evtl. kein Auth-User.
    // Dann legen wir einen Auth-User an (invite-only) und versuchen es erneut.
    try {
      const { data } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { role },
        app_metadata: { role },
      });
      userId = data.user?.id ?? null;
    } catch {
      // ignore
    }
  }

  if (!userId) {
    userId = await findAuthUserIdByEmail(email);
  }

  if (!userId) {
    return NextResponse.json({ error: "Auth-Benutzer nicht gefunden." }, { status: 404 });
  }

  const { error: updateUserError } = await admin.auth.admin.updateUserById(userId, {
    password,
    user_metadata: {
      full_name: fullName,
      role,
    },
    app_metadata: {
      role,
    },
  });

  if (updateUserError) {
    return NextResponse.json({ error: "Benutzer konnte nicht aktualisiert werden." }, { status: 500 });
  }

  // Profiles: zentrale, sichtbare Rolle + Name (Option B)
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return NextResponse.json({ error: "Profil konnte nicht gespeichert werden." }, { status: 500 });
  }

  const { error: updateInviteError } = await admin
    .from("invitations")
    .update({ status: "accepted" })
    .eq("id", inviteRow.id);

  if (updateInviteError) {
    return NextResponse.json({ error: "Einladung konnte nicht aktualisiert werden." }, { status: 500 });
  }

  return NextResponse.json({ message: "Registrierung abgeschlossen.", role });
}

