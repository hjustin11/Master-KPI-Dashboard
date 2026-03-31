import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { type Role } from "@/shared/lib/invitations";
import { normalizeRoleKey } from "@/shared/lib/roles";

function resolveRole(value: unknown): Role | null {
  return normalizeRoleKey(value);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";

  // Invite-only: bewusst knappe Antwort, um Enumeration nicht zu erleichtern.
  if (!email) {
    return NextResponse.json({ invited: false });
  }

  const admin = createAdminClient();

  const { data: inviteRow, error: inviteError } = await admin
    .from("invitations")
    .select("token,role,status,expires_at")
    .eq("email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inviteError || !inviteRow) {
    return NextResponse.json({ invited: false });
  }

  const expiresAt = new Date(inviteRow.expires_at as string).getTime();
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    return NextResponse.json({ invited: false });
  }

  const role = resolveRole(inviteRow.role);
  if (!role) {
    return NextResponse.json({ invited: false });
  }

  const token = String(inviteRow.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ invited: false });
  }

  // Auth-User sicherstellen (damit /api/invitations/complete später Passwort setzen kann)
  // createUser schlägt bei bestehenden Usern fehl -> dann ignorieren wir es.
  let userId: string | null = null;
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

  // Profile vorab anlegen (sichtbare Rolle in DB)
  if (userId) {
    try {
      await admin.from("profiles").upsert(
        {
          id: userId,
          email,
          full_name: "",
          role,
        },
        { onConflict: "id" }
      );
    } catch {
      // ignore
    }
  }

  const inviteUrl = `/register?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(
    email
  )}&role=${role}`;

  return NextResponse.json({ invited: true, role, inviteUrl });
}

