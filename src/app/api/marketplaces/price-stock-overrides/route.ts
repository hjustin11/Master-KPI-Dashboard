import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";

type UpdateItem = {
  sku: string;
  marketplaceSlug: string;
  priceEur?: number | null;
  stockQty?: number | null;
};

const ALLOWED_MARKETPLACE_SLUGS = new Set(["amazon", ...ANALYTICS_MARKETPLACES.map((m) => m.slug)]);

function asFiniteOrNull(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export async function PUT(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { updates?: unknown } | null;
  if (!body || !Array.isArray(body.updates)) {
    return NextResponse.json({ error: "Erwartet: { updates: [...] }." }, { status: 400 });
  }

  const updates: UpdateItem[] = [];
  for (const raw of body.updates) {
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Ungültiger Update-Eintrag." }, { status: 400 });
    }
    const row = raw as Record<string, unknown>;
    const sku = String(row.sku ?? "").trim();
    const marketplaceSlug = String(row.marketplaceSlug ?? "").trim();
    if (!sku || !marketplaceSlug || !ALLOWED_MARKETPLACE_SLUGS.has(marketplaceSlug)) {
      return NextResponse.json({ error: "Ungültiger SKU/Marktplatz." }, { status: 400 });
    }
    const priceEur = asFiniteOrNull(row.priceEur);
    const stockQty = asFiniteOrNull(row.stockQty);
    if (priceEur === undefined && stockQty === undefined) {
      return NextResponse.json({ error: "Mindestens ein Feld (priceEur/stockQty) erforderlich." }, { status: 400 });
    }
    updates.push({ sku, marketplaceSlug, priceEur, stockQty });
  }

  if (updates.length === 0) return NextResponse.json({ ok: true, updated: 0 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server-Konfiguration unvollständig (Supabase Service Role)." },
      { status: 503 }
    );
  }

  const skus = [...new Set(updates.map((u) => u.sku))];
  const slugs = [...new Set(updates.map((u) => u.marketplaceSlug))];
  const { data: existing, error: readErr } = await admin
    .from("marketplace_price_stock_overrides")
    .select("sku, marketplace_slug, price_eur, stock_qty")
    .in("sku", skus)
    .in("marketplace_slug", slugs);
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  const existingMap = new Map<string, { price_eur: number | null; stock_qty: number | null }>();
  for (const row of existing ?? []) {
    const key = `${String(row.sku)}::${String(row.marketplace_slug)}`;
    existingMap.set(key, {
      price_eur: row.price_eur == null ? null : Number(row.price_eur),
      stock_qty: row.stock_qty == null ? null : Number(row.stock_qty),
    });
  }

  const rows = updates.map((u) => {
    const key = `${u.sku}::${u.marketplaceSlug}`;
    const prev = existingMap.get(key) ?? { price_eur: null, stock_qty: null };
    return {
      sku: u.sku,
      marketplace_slug: u.marketplaceSlug,
      price_eur: u.priceEur === undefined ? prev.price_eur : u.priceEur,
      stock_qty: u.stockQty === undefined ? prev.stock_qty : u.stockQty,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertErr } = await admin
    .from("marketplace_price_stock_overrides")
    .upsert(rows, { onConflict: "sku,marketplace_slug" });
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: rows.length });
}
