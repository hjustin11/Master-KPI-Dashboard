import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  PROCUREMENT_WORKBOOK_SHEET,
  parseTransportationWorkbook,
  readWorkbookFromBuffer,
} from "@/shared/lib/procurement/parseTransportationWorkbook";
import { compareProcurementByContainer } from "@/shared/lib/procurement/compareProcurementImports";
import type { ProcurementProductRowLike } from "@/shared/lib/procurement/procurementAggregation";

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
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

  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Content-Type multipart/form-data erwartet." }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Datei „file“ fehlt." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Datei zu groß (max. 15 MB)." }, { status: 400 });
  }

  const name = file.name || "upload.xlsx";
  const lower = name.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    return NextResponse.json({ error: "Nur Excel-Dateien (.xlsx, .xls)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let workbook;
  try {
    workbook = readWorkbookFromBuffer(buffer);
  } catch {
    return NextResponse.json({ error: "Excel-Datei konnte nicht gelesen werden." }, { status: 400 });
  }

  const parsed = parseTransportationWorkbook(workbook);
  if (parsed.length === 0) {
    const hasSheet = workbook.SheetNames.some((n) => n.trim() === PROCUREMENT_WORKBOOK_SHEET);
    if (!hasSheet) {
      return NextResponse.json(
        {
          error: `Tabellenblatt „${PROCUREMENT_WORKBOOK_SHEET}“ fehlt. Es wird nur dieses Blatt importiert.`,
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Keine gültigen Datenzeilen gefunden (erwartete Spalten: u. a. SKU, Container Number)." },
      { status: 400 }
    );
  }

  const { data: prevImport } = await admin
    .from("procurement_imports")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let previousLinesForCompare: ProcurementProductRowLike[] = [];
  if (prevImport?.id) {
    const { data: prevRaw } = await admin
      .from("procurement_lines")
      .select("sort_index,container_number,product_name,sku,amount,arrival_at_port,notes")
      .eq("import_id", prevImport.id as string)
      .order("sort_index", { ascending: true });
    previousLinesForCompare = (prevRaw ?? []).map((r) => ({
      containerNumber: String(r.container_number ?? ""),
      sortIndex: Number(r.sort_index ?? 0),
      productName: String(r.product_name ?? ""),
      sku: String(r.sku ?? ""),
      amount: Number(r.amount ?? 0),
      arrivalAtPort: r.arrival_at_port ? String(r.arrival_at_port) : "",
      notes: String(r.notes ?? ""),
    }));
  }

  const nextLinesForCompare: ProcurementProductRowLike[] = parsed.map((line, j) => ({
    containerNumber: line.containerNumber,
    sortIndex: j,
    productName: line.productName,
    sku: line.sku,
    amount: line.amount,
    arrivalAtPort: line.arrivalAtPort,
    notes: line.notes,
  }));

  const importComparison =
    previousLinesForCompare.length > 0
      ? compareProcurementByContainer(previousLinesForCompare, nextLinesForCompare)
      : {};

  const { error: delError } = await admin
    .from("procurement_imports")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (delError) {
    return NextResponse.json(
      { error: "Vorherige Beschaffungsdaten konnten nicht gelöscht werden.", details: delError.message },
      { status: 500 }
    );
  }

  const { data: batch, error: insBatchError } = await admin
    .from("procurement_imports")
    .insert({
      file_name: name,
      user_id: user.id,
      row_count: parsed.length,
      import_comparison:
        Object.keys(importComparison).length > 0 ? importComparison : null,
    })
    .select("id")
    .single();

  if (insBatchError || !batch) {
    return NextResponse.json(
      { error: "Import konnte nicht angelegt werden.", details: insBatchError?.message },
      { status: 500 }
    );
  }

  const importId = batch.id as string;
  const chunkSize = 400;
  for (let i = 0; i < parsed.length; i += chunkSize) {
    const slice = parsed.slice(i, i + chunkSize);
    const rows = slice.map((line, j) => ({
      import_id: importId,
      sort_index: i + j,
      container_number: line.containerNumber,
      manufacture: line.manufacture,
      product_name: line.productName,
      sku: line.sku,
      amount: line.amount,
      arrival_at_port: line.arrivalAtPort ? line.arrivalAtPort : null,
      notes: line.notes,
    }));

    const { error: lineErr } = await admin.from("procurement_lines").insert(rows);
    if (lineErr) {
      await admin.from("procurement_imports").delete().eq("id", importId);
      return NextResponse.json(
        { error: "Zeilen konnten nicht gespeichert werden.", details: lineErr.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    importId,
    rowCount: parsed.length,
    fileName: name,
    comparisonChanged: Object.keys(importComparison).length,
  });
}
