import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { isOwnerFromSources } from "@/shared/lib/roles";

type DashboardUpdateRow = {
  id: string;
  date: string;
  title: string;
  text: string;
  release_key: string | null;
  created_at: string;
};

function isMissingDashboardUpdatesTable(err: { code?: string; message?: string } | null | undefined) {
  if (!err) return false;
  if (err.code === "42P01") return true;
  const msg = err.message ?? "";
  return /dashboard_updates|does not exist|schema cache/i.test(msg);
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getCurrentUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { user, supabase };
}

async function isOwnerUser(args: {
  user: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
}) {
  const { user, supabase } = args;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return isOwnerFromSources({
    profileRole: profile?.role,
    appRole: user.app_metadata?.role,
    userRole: user.user_metadata?.role,
  });
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dashboard_updates")
    .select("id,date,title,text,release_key,created_at")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (isMissingDashboardUpdatesTable(error as { code?: string; message?: string } | undefined)) {
    return NextResponse.json({ items: [], tableMissing: true });
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: (data ?? []) as DashboardUpdateRow[] });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!(await isOwnerUser(currentUser))) {
    return NextResponse.json({ error: "Nur Entwickler dürfen Updates verwalten." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { date?: string; title?: string; text?: string; releaseKey?: string | null }
    | null;
  const date = String(body?.date ?? "").trim();
  const title = String(body?.title ?? "").trim();
  const text = String(body?.text ?? "").trim();
  const releaseKeyRaw = typeof body?.releaseKey === "string" ? body.releaseKey.trim() : "";
  const releaseKey = releaseKeyRaw ? releaseKeyRaw : null;

  if (!isYmd(date) || !title || !text) {
    return NextResponse.json(
      { error: "Erwartet: gültiges Datum (YYYY-MM-DD), Titel und Text." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dashboard_updates")
    .insert({
      date,
      title,
      text,
      release_key: releaseKey,
      created_by: currentUser.user.id,
    })
    .select("id,date,title,text,release_key,created_at")
    .single();
  if (error || !data) {
    if (isMissingDashboardUpdatesTable(error as { code?: string; message?: string } | undefined)) {
      return NextResponse.json(
        { error: "Tabelle 'dashboard_updates' fehlt. Bitte Migration ausführen und erneut laden." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error?.message ?? "Update konnte nicht gespeichert werden." }, { status: 500 });
  }
  return NextResponse.json({ item: data as DashboardUpdateRow }, { status: 201 });
}

export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!(await isOwnerUser(currentUser))) {
    return NextResponse.json({ error: "Nur Entwickler dürfen Updates verwalten." }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "id ist erforderlich." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("dashboard_updates").delete().eq("id", id);
  if (isMissingDashboardUpdatesTable(error as { code?: string; message?: string } | undefined)) {
    return NextResponse.json(
      { error: "Tabelle 'dashboard_updates' fehlt. Bitte Migration ausführen und erneut laden." },
      { status: 503 }
    );
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}
