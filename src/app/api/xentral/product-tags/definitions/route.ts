import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { sanitizeTagDefs } from "@/shared/lib/xentralProductTags";

export async function PUT(request: Request) {
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

  const body = (await request.json().catch(() => null)) as { defs?: unknown } | null;
  if (!body || !Array.isArray(body.defs)) {
    return NextResponse.json({ error: "„defs“ muss ein Array sein." }, { status: 400 });
  }
  const defs = sanitizeTagDefs(body.defs);
  const allowed = new Set(defs.map((d) => d.id));

  const { data: existing, error: existingErr } = await admin
    .from("xentral_product_tag_defs")
    .select("label");

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const oldLabels = new Set((existing ?? []).map((r) => String(r.label ?? "").trim()).filter(Boolean));
  for (const id of allowed) oldLabels.delete(id);

  if (oldLabels.size > 0) {
    const { error: delErr } = await admin
      .from("xentral_product_tag_defs")
      .delete()
      .in(
        "label",
        [...oldLabels]
      );
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  const now = new Date().toISOString();
  for (const d of defs) {
    const { error: upErr } = await admin.from("xentral_product_tag_defs").upsert(
      {
        label: d.id,
        color: d.color,
        updated_at: now,
        updated_by: user.id,
      },
      { onConflict: "label" }
    );
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  if (oldLabels.size > 0) {
    const removed = [...oldLabels];
    const { error: skuClearErr } = await admin
      .from("xentral_product_sku_tags")
      .update({
        tag_label: null,
        updated_at: now,
        updated_by: user.id,
      })
      .in("tag_label", removed);
    if (skuClearErr) {
      return NextResponse.json({ error: skuClearErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, defs });
}
