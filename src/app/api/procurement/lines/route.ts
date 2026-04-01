import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { parseDashboardAccessConfig } from "@/shared/lib/dashboard-access-config";
import { getIntegrationCachedOrLoad } from "@/shared/lib/integrationDataCache";
import { pageAccessForRole } from "@/shared/lib/role-page-access";
import type { ContainerComparisonDelta } from "@/shared/lib/procurement/compareProcurementImports";
import {
  buildProcurementPayload,
  PROCUREMENT_LINES_CACHE_FRESH_MS,
  PROCUREMENT_LINES_CACHE_STALE_MS,
  type LatestImportRow,
} from "@/shared/lib/procurement/procurementLinesPayload";
import { resolveEffectiveRoleKey } from "@/shared/lib/roles";

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  const effectiveRole = resolveEffectiveRoleKey({
    profileRole: profile?.role,
    appRole: user.app_metadata?.role,
    userRole: user.user_metadata?.role,
  });
  const baseAccess = pageAccessForRole(effectiveRole);

  const { data: accessConfigRow, error: accessConfigErr } = await supabase
    .from("dashboard_access_config")
    .select("config")
    .eq("id", "default")
    .maybeSingle();
  if (accessConfigErr) {
    return NextResponse.json({ error: accessConfigErr.message }, { status: 500 });
  }

  const parsedAccessConfig = parseDashboardAccessConfig(accessConfigRow?.config as unknown);
  const roleAccessOverrides = parsedAccessConfig?.rolePageAccess?.[effectiveRole] ?? {};
  const canAccessProcurement = Boolean({
    ...baseAccess,
    ...roleAccessOverrides,
  }["analytics.procurement"]);
  if (!canAccessProcurement) {
    return NextResponse.json({ error: "Keine Berechtigung für Beschaffung." }, { status: 403 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server-Konfiguration unvollständig (Supabase Service Role)." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const bypassCache =
    searchParams.get("refresh") === "1" || process.env.PROCUREMENT_LINES_CACHE_DISABLE === "1";

  const { data: latest, error: impErr } = await admin
    .from("procurement_imports")
    .select("id,file_name,created_at,row_count,import_comparison")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (impErr) {
    return NextResponse.json({ error: impErr.message }, { status: 500 });
  }

  if (!latest) {
    return NextResponse.json({
      import: null,
      lines: [],
      comparison: {} as Record<string, ContainerComparisonDelta>,
    });
  }

  const row = latest as LatestImportRow;

  try {
    const payload = bypassCache
      ? await buildProcurementPayload(admin, row)
      : await getIntegrationCachedOrLoad({
          cacheKey: `procurement:lines:${row.id}`,
          source: "procurement:lines",
          freshMs: PROCUREMENT_LINES_CACHE_FRESH_MS,
          staleMs: PROCUREMENT_LINES_CACHE_STALE_MS,
          loader: () => buildProcurementPayload(admin, row),
        });
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
