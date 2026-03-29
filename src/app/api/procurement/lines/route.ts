import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import type { ContainerComparisonDelta } from "@/shared/lib/procurement/compareProcurementImports";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
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

  const importId = latest.id as string;
  const { data: rawLines, error: linesErr } = await admin
    .from("procurement_lines")
    .select(
      "id,sort_index,container_number,manufacture,product_name,sku,amount,arrival_at_port,notes"
    )
    .eq("import_id", importId)
    .order("sort_index", { ascending: true });

  if (linesErr) {
    return NextResponse.json({ error: linesErr.message }, { status: 500 });
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

  return NextResponse.json({
    import: {
      id: latest.id,
      fileName: latest.file_name,
      createdAt: latest.created_at,
      rowCount: latest.row_count,
    },
    lines,
    comparison: rawComp && typeof rawComp === "object" ? rawComp : {},
  });
}
