import { createAdminClient } from "@/shared/lib/supabase/admin";
import { getIntegrationCachedOrLoad } from "@/shared/lib/integrationDataCache";
import type { ContainerComparisonDelta } from "@/shared/lib/procurement/compareProcurementImports";

export type LatestImportRow = {
  id: string;
  file_name: string | null;
  created_at: string;
  row_count: number | null;
  import_comparison: unknown;
};

export const PROCUREMENT_LINES_CACHE_FRESH_MS = 5 * 60 * 1000;
export const PROCUREMENT_LINES_CACHE_STALE_MS = 45 * 60 * 1000;

export async function buildProcurementPayload(
  admin: ReturnType<typeof createAdminClient>,
  latest: LatestImportRow
) {
  const importId = latest.id;
  const { data: rawLines, error: linesErr } = await admin
    .from("procurement_lines")
    .select(
      "id,sort_index,container_number,manufacture,product_name,sku,amount,arrival_at_port,notes"
    )
    .eq("import_id", importId)
    .order("sort_index", { ascending: true });

  if (linesErr) {
    throw new Error(linesErr.message);
  }

  const lines = (rawLines ?? []).map((r) => ({
    id: r.id as string,
    sortIndex: r.sort_index as number,
    containerNumber: String(r.container_number ?? ""),
    manufacture: String(r.manufacture ?? ""),
    productName: String(r.product_name ?? ""),
    sku: String(r.sku ?? ""),
    amount: Number(r.amount ?? 0),
    arrivalAtPort: r.arrival_at_port ? String(r.arrival_at_port) : "",
    notes: String(r.notes ?? ""),
  }));

  const rawComp = latest.import_comparison as
    | Record<string, ContainerComparisonDelta>
    | null
    | undefined;

  return {
    import: {
      id: latest.id,
      fileName: latest.file_name,
      createdAt: latest.created_at,
      rowCount: latest.row_count,
    },
    lines,
    comparison: rawComp && typeof rawComp === "object" ? rawComp : {},
  };
}

/** Cron/Prewarm: Cache füllen ohne Browser-Request (nutzt Service-Role, kein User-Cookie). */
export async function warmProcurementLinesCache(): Promise<{
  ok: boolean;
  skipped?: boolean;
  importId?: string;
  error?: string;
}> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Kein Admin-Client",
    };
  }

  const { data: latest, error: impErr } = await admin
    .from("procurement_imports")
    .select("id,file_name,created_at,row_count,import_comparison")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (impErr) {
    return { ok: false, error: impErr.message };
  }
  if (!latest) {
    return { ok: true, skipped: true };
  }

  const row = latest as LatestImportRow;

  try {
    await getIntegrationCachedOrLoad({
      cacheKey: `procurement:lines:${row.id}`,
      source: "procurement:lines",
      freshMs: PROCUREMENT_LINES_CACHE_FRESH_MS,
      staleMs: PROCUREMENT_LINES_CACHE_STALE_MS,
      loader: () => buildProcurementPayload(admin, row),
    });
    return { ok: true, importId: row.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
