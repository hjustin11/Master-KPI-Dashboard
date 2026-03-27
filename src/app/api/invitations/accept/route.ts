import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { type Role } from "@/shared/lib/invitations";

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

export async function POST(request: Request) {
  const body = (await request.json()) as { token?: string };
  const token = body.token?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "token ist erforderlich." }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: inviteRow, error: inviteError } = await admin
    .from("invitations")
    .select("id,email,role,status,expires_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteError || !inviteRow) {
    return NextResponse.json(
      { error: "Einladung nicht gefunden." },
      { status: 404 }
    );
  }

  if (inviteRow.status !== "pending") {
    return NextResponse.json(
      { error: "Einladung wurde bereits verwendet." },
      { status: 400 }
    );
  }

  const inviteEmail = (inviteRow.email ?? "").toLowerCase();
  const userEmail = (user.email ?? "").toLowerCase();
  if (!userEmail || userEmail !== inviteEmail) {
    return NextResponse.json(
      { error: "Diese Einladung gehoert nicht zu deinem Konto." },
      { status: 403 }
    );
  }

  const expiresAt = new Date(inviteRow.expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    return NextResponse.json({ error: "Einladung ist abgelaufen." }, { status: 400 });
  }

  const role = resolveRole(inviteRow.role);
  if (!role) {
    return NextResponse.json({ error: "Ungueltige Rolle in Einladung." }, { status: 400 });
  }

  const { error: updateInviteError } = await admin
    .from("invitations")
    .update({ status: "accepted" })
    .eq("id", inviteRow.id);

  if (updateInviteError) {
    return NextResponse.json(
      { error: "Einladung konnte nicht aktualisiert werden." },
      { status: 500 }
    );
  }

  const { error: updateUserError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      role,
    },
    app_metadata: {
      ...(user.app_metadata ?? {}),
      role,
    },
  });

  if (updateUserError) {
    return NextResponse.json(
      { error: "Benutzerrolle konnte nicht gesetzt werden." },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "Einladung akzeptiert.", role });
}

