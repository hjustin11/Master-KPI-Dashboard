import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";
import {
  isValidPromotionDeal,
  type PromotionDeal,
} from "@/app/(dashboard)/analytics/marketplaces/marketplaceActionBands";

const ALLOWED_SLUGS = new Set<string>([
  "amazon",
  ...ANALYTICS_MARKETPLACES.map((m) => m.slug),
]);

function rowToDeal(row: {
  id: string;
  label: string;
  date_from: string;
  date_to: string;
  color: string;
  marketplace_slug: string | null;
}): PromotionDeal {
  return {
    id: row.id,
    label: row.label,
    from: row.date_from.slice(0, 10),
    to: row.date_to.slice(0, 10),
    color: row.color,
    marketplaceSlug: row.marketplace_slug,
  };
}

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

  const { data, error } = await admin
    .from("marketplace_promotion_deals")
    .select("id,label,date_from,date_to,color,marketplace_slug")
    .eq("user_id", user.id)
    .order("date_from", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deals: PromotionDeal[] = (data ?? []).map((row) =>
    rowToDeal(
      row as {
        id: string;
        label: string;
        date_from: string;
        date_to: string;
        color: string;
        marketplace_slug: string | null;
      }
    )
  );

  return NextResponse.json({ deals });
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

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server-Konfiguration unvollständig (Supabase Service Role)." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as { deals?: unknown } | null;
  const raw = body?.deals;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "Erwartet: { deals: PromotionDeal[] }." }, { status: 400 });
  }

  const deals: PromotionDeal[] = [];
  for (const item of raw) {
    if (!isValidPromotionDeal(item)) {
      return NextResponse.json({ error: "Ungültiges Deal-Objekt." }, { status: 400 });
    }
    const slug = item.marketplaceSlug;
    if (slug !== null && !ALLOWED_SLUGS.has(slug)) {
      return NextResponse.json({ error: "Ungültiger Marktplatz." }, { status: 400 });
    }
    if (item.from > item.to) {
      return NextResponse.json({ error: "„Von“ muss vor oder gleich „Bis“ sein." }, { status: 400 });
    }
    deals.push(item);
  }

  const { error: delErr } = await admin
    .from("marketplace_promotion_deals")
    .delete()
    .eq("user_id", user.id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (deals.length === 0) {
    return NextResponse.json({ deals: [] });
  }

  const rows = deals.map((d) => ({
    id: d.id,
    user_id: user.id,
    label: d.label.trim() || "Aktion",
    date_from: d.from,
    date_to: d.to,
    color: d.color,
    marketplace_slug: d.marketplaceSlug,
    updated_at: new Date().toISOString(),
  }));

  const { error: insErr } = await admin.from("marketplace_promotion_deals").insert(rows);

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ deals });
}
