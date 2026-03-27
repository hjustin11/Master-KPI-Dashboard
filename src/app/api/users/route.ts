import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";

function isOwnerUser(user: {
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}) {
  const appRole = user.app_metadata?.role;
  const userRole = user.user_metadata?.role;
  if (appRole === "owner" || userRole === "owner") return true;
  const email = (user.email ?? "").toLowerCase();
  const ownerEmails =
    process.env.OWNER_EMAILS?.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean) ??
    [];
  return Boolean(email) && ownerEmails.includes(email);
}

async function getCurrentUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!isOwnerUser(currentUser)) {
    return NextResponse.json(
      { error: "Nur Owner dürfen Benutzer verwalten." },
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
  if (!isOwnerUser(currentUser)) {
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
  if (body.userId === currentUser.id) {
    return NextResponse.json(
      { error: "Owner kann sich nicht selbst loeschen." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(body.userId);
  if (error) {
    return NextResponse.json(
      { error: "Benutzer konnte nicht entfernt werden." },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "Benutzer wurde entfernt." });
}
