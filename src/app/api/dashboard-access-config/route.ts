import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { parseDashboardAccessConfig } from "@/shared/lib/dashboard-access-config";
import { isOwnerFromSources } from "@/shared/lib/roles";

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

/** Jede eingeloggte Rolle lädt dieselben UI-Grundregeln (Sidebar, Karten, Rechte). */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const { supabase } = currentUser;
  const { data, error } = await supabase
    .from("dashboard_access_config")
    .select("config, updated_at")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        config: null,
        unavailable: true,
        message: error.message,
      },
      { status: 503 }
    );
  }

  const raw = data?.config as unknown;
  if (raw == null) {
    return NextResponse.json({ config: null });
  }

  const parsed = parseDashboardAccessConfig(raw);
  if (!parsed) {
    return NextResponse.json({ config: null, invalid: true });
  }

  return NextResponse.json({
    config: parsed,
    updatedAt: data?.updated_at ?? null,
  });
}

/** Nur Owner: Speichern beim Beenden von „Dashboard bearbeiten“. */
export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!(await isOwnerUser(currentUser))) {
    return NextResponse.json(
      { error: "Nur Owner dürfen die Dashboard-Grundregeln speichern." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = parseDashboardAccessConfig(body);
  if (!parsed) {
    return NextResponse.json({ error: "Ungültiges Konfigurationsschema." }, { status: 400 });
  }

  const { supabase } = currentUser;
  const { error } = await supabase.from("dashboard_access_config").upsert(
    {
      id: "default",
      config: parsed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    return NextResponse.json(
      { error: error.message || "Speichern in der Datenbank fehlgeschlagen." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
