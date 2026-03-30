import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import type { XentralProductTagDef } from "@/shared/lib/xentralProductTags";

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

  const { data: defsRows, error: defsErr } = await admin
    .from("xentral_product_tag_defs")
    .select("label,color")
    .order("label", { ascending: true });

  if (defsErr) {
    return NextResponse.json({ error: defsErr.message }, { status: 500 });
  }

  const { data: skuRows, error: skuErr } = await admin
    .from("xentral_product_sku_tags")
    .select("sku,tag_label");

  if (skuErr) {
    return NextResponse.json({ error: skuErr.message }, { status: 500 });
  }

  const tagDefs: XentralProductTagDef[] = (defsRows ?? []).map((r) => ({
    id: String(r.label ?? "").trim(),
    color: String(r.color ?? "").trim(),
  }));

  const tagBySku: Record<string, string | null> = {};
  for (const row of skuRows ?? []) {
    const sku = String(row.sku ?? "").trim();
    if (!sku) continue;
    const tl = row.tag_label;
    tagBySku[sku] = tl === null || tl === undefined ? null : String(tl).trim() || null;
  }

  return NextResponse.json({ tagDefs, tagBySku });
}
