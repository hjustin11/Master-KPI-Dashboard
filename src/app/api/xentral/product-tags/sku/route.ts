import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { sanitizeSku } from "@/shared/lib/xentralProductTags";

type Body = {
  sku?: unknown;
  /** Gesetztes Tag (Label); `null` = explizit „Kein Tag“. */
  tag?: unknown;
  /** Zeile löschen → automatische Tag-Logik (Bestand). */
  revert?: unknown;
};

export async function PATCH(request: Request) {
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

  const body = (await request.json().catch(() => null)) as Body | null;
  const sku = sanitizeSku(body?.sku);
  if (!sku) {
    return NextResponse.json({ error: "Ungültige SKU." }, { status: 400 });
  }

  const revert = body?.revert === true;
  if (revert) {
    const { error } = await admin.from("xentral_product_sku_tags").delete().eq("sku", sku);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, sku, reverted: true });
  }

  if (!Object.prototype.hasOwnProperty.call(body ?? {}, "tag")) {
    return NextResponse.json({ error: "Feld „tag“ oder „revert“ erforderlich." }, { status: 400 });
  }

  const tagRaw = body?.tag;
  let tagLabel: string | null;
  if (tagRaw === null) {
    tagLabel = null;
  } else if (typeof tagRaw === "string") {
    const t = tagRaw.trim();
    tagLabel = t.length > 0 ? t : null;
  } else {
    return NextResponse.json({ error: "Ungültiges Tag." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await admin.from("xentral_product_sku_tags").upsert(
    {
      sku,
      tag_label: tagLabel,
      updated_at: now,
      updated_by: user.id,
    },
    { onConflict: "sku" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sku, tag: tagLabel });
}
