import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { isOwnerRole, isOwnerOrAdminRole } from "@/shared/lib/roles";

async function getCurrentUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { user, supabase };
}

async function isOwnerOrTeamLeadUser(args: {
  user: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
}) {
  const { user, supabase } = args;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (isOwnerOrAdminRole(profile?.role)) return true;
  return isOwnerOrAdminRole(user.app_metadata?.role) || isOwnerOrAdminRole(user.user_metadata?.role);
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!(await isOwnerOrTeamLeadUser(currentUser))) {
    return NextResponse.json(
      { error: "Nur Owner oder Team-Lead dürfen Teammitglieder sehen." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    return NextResponse.json(
      { error: "Benutzer konnten nicht geladen werden." },
      { status: 500 }
    );
  }

  const ids = data.users?.map((u) => u.id) ?? [];
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id,role").in("id", ids)
    : { data: [] as Array<{ id: string; role: string }> };
  const roleById = new Map(
    (profiles ?? []).map((row) => [row.id, (row.role as string | undefined) ?? "viewer"])
  );

  const users =
    data.users?.map((item) => ({
      id: item.id,
      email: item.email ?? "",
      role:
        roleById.get(item.id) ??
        ((item.app_metadata?.role as string | undefined) ??
          (item.user_metadata?.role as string | undefined) ??
          "viewer"),
      createdAt: item.created_at,
    })) ?? [];

  return NextResponse.json({ users });
}

export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  const isOwner = await (async () => {
    const { user, supabase } = currentUser;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (isOwnerRole(profile?.role)) return true;
    return isOwnerRole(user.app_metadata?.role) || isOwnerRole(user.user_metadata?.role);
  })();
  if (!isOwner) {
    return NextResponse.json(
      { error: "Nur Owner dürfen Benutzer entfernen." },
      { status: 403 }
    );
  }

  const body = (await request.json()) as { userId?: string };
  if (!body.userId) {
    return NextResponse.json(
      { error: "userId ist erforderlich." },
      { status: 400 }
    );
  }
  if (body.userId === currentUser.user.id) {
    return NextResponse.json(
      { error: "Owner kann sich nicht selbst loeschen." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: targetUserData, error: targetUserError } = await admin.auth.admin.getUserById(
    body.userId
  );
  if (targetUserError || !targetUserData?.user) {
    return NextResponse.json(
      { error: "Benutzer wurde nicht gefunden." },
      { status: 404 }
    );
  }

  const targetUser = targetUserData.user;
  const targetRole =
    (typeof targetUser.app_metadata?.role === "string" ? targetUser.app_metadata.role : null) ??
    (typeof targetUser.user_metadata?.role === "string" ? targetUser.user_metadata.role : null);
  if (targetRole === "owner") {
    return NextResponse.json(
      { error: "Owner-Benutzer koennen nicht entfernt werden." },
      { status: 400 }
    );
  }

  const targetEmail = (targetUser.email ?? "").toLowerCase().trim();

  // Best-effort Cleanup: in manchen Setups sind diese Tabellen nicht vorhanden.
  // Fehler werden toleriert, solange die eigentliche User-Löschung funktioniert.
  await admin.from("tutorial_user_progress").delete().eq("user_id", body.userId);
  await admin.from("profiles").delete().eq("id", body.userId);
  if (targetEmail) {
    await admin.from("invitations").delete().eq("email", targetEmail);
  }
  await admin.from("invitations").delete().eq("invited_by", body.userId);

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(body.userId);
  if (deleteUserError) {
    return NextResponse.json(
      { error: "Benutzer konnte nicht vollstaendig entfernt werden." },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "Benutzer wurde vollstaendig entfernt." });
}
