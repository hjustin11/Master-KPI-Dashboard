import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { loadMarketplaceProductRowsForPriceParity } from "@/shared/lib/marketplaceProductCachesPrime";
import {
  matchArticleToMarketplace,
  type MatchCandidate,
  type XentralArticle as MatcherArticle,
} from "@/shared/lib/crossListing/articleMatcher";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type VerifyRequest = {
  sku?: string;
  marketplaceSlug?: string;
  title?: string;
  ean?: string | null;
};

function extractEan(row: Record<string, unknown>): string | null {
  const extras = (row.extras as Record<string, unknown> | undefined) ?? {};
  const candidates = [row.ean, row.gtin, row.barcode, extras.ean, extras.gtin, extras.barcode];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
  }
  return null;
}

function extractAsin(row: Record<string, unknown>): string | null {
  const extras = (row.extras as Record<string, unknown> | undefined) ?? {};
  const candidates = [row.asin, extras.asin];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function candidatesFromProductItems(items: Array<Record<string, unknown>>): MatchCandidate[] {
  return items.map((it) => ({
    marketplaceSku: typeof it.sku === "string" ? it.sku : null,
    ean: extractEan(it),
    asin: extractAsin(it),
    title: typeof it.title === "string" ? it.title : null,
    secondaryId: typeof it.secondaryId === "string" ? it.secondaryId : null,
  }));
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as VerifyRequest | null;
  if (!body) return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });

  const sku = (body.sku ?? "").trim();
  const marketplaceSlug = (body.marketplaceSlug ?? "").trim().toLowerCase();
  if (!sku || !marketplaceSlug) {
    return NextResponse.json({ error: "sku und marketplaceSlug sind erforderlich." }, { status: 400 });
  }

  const matcherArticle: MatcherArticle = {
    sku,
    title: body.title ?? sku,
    ean: body.ean ?? null,
  };

  let rows: Array<Record<string, unknown>> | null = null;

  if (marketplaceSlug === "amazon") {
    try {
      const origin = new URL(request.url).origin;
      const cookie = request.headers.get("cookie") ?? "";
      const res = await fetch(`${origin}/api/amazon/products?status=all&all=1&refresh=1`, {
        cache: "no-store",
        headers: { cookie },
      });
      if (res.ok) {
        const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
        rows = json.items ?? [];
      }
    } catch {
      rows = null;
    }
  } else {
    const cached = await loadMarketplaceProductRowsForPriceParity(marketplaceSlug, true);
    rows = (cached as Array<Record<string, unknown>> | null) ?? null;
  }

  if (rows === null) {
    return NextResponse.json(
      { error: `Marktplatz '${marketplaceSlug}' ist nicht verbunden oder nicht unterstützt.` },
      { status: 400 }
    );
  }

  const candidates = candidatesFromProductItems(rows);
  const matchResult = matchArticleToMarketplace(matcherArticle, candidates);

  const nowIso = new Date().toISOString();
  let mappingWritten = false;

  if (matchResult.matched && matchResult.candidate) {
    try {
      const admin = createAdminClient();
      await admin.from("marketplace_article_mappings").upsert(
        {
          xentral_sku: sku,
          marketplace_slug: marketplaceSlug,
          marketplace_sku: matchResult.candidate.marketplaceSku ?? sku,
          marketplace_secondary_id: matchResult.candidate.secondaryId ?? null,
          ean: matchResult.candidate.ean ?? body.ean ?? null,
          match_type: matchResult.matchType ?? "manual",
          confidence: matchResult.confidence,
          verified_at: nowIso,
          created_by: user.id,
          updated_at: nowIso,
        },
        { onConflict: "xentral_sku,marketplace_slug" }
      );
      mappingWritten = true;
    } catch {
      // Tabelle kann in alten Envs fehlen — Verify-Ergebnis wird trotzdem zurückgegeben.
    }
  }

  return NextResponse.json({
    matched: matchResult.matched,
    matchType: matchResult.matchType,
    confidence: matchResult.confidence,
    reason: matchResult.reason,
    marketplaceSku: matchResult.candidate?.marketplaceSku ?? null,
    verifiedAt: matchResult.matched ? nowIso : null,
    mappingWritten,
  });
}
