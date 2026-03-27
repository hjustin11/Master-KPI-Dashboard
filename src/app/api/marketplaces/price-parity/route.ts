import { NextResponse } from "next/server";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";

type XentralArticle = {
  sku: string;
  name: string;
  stock: number;
  price: number | null;
};

type AmazonItem = {
  sku: string;
  price: number | null;
};

export type MarketplaceCellState = "ok" | "missing" | "no_price" | "mismatch" | "not_connected";

export type PriceParityRow = {
  sku: string;
  name: string;
  stock: number;
  referencePrice: number | null;
  referenceSource: "xentral" | "amazon" | null;
  amazon: { price: number | null; state: MarketplaceCellState };
  otherMarketplaces: Record<string, { price: number | null; state: MarketplaceCellState }>;
  needsReview: boolean;
};

function normSku(value: string) {
  return value.trim().toLowerCase();
}

function pricesDiffer(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a - b) <= 0.02) return false;
  const avg = (Math.abs(a) + Math.abs(b)) / 2;
  if (avg < 1e-9) return false;
  return Math.abs(a - b) / avg > 0.005;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "300") || 300, 50), 500);
    const origin = url.origin;

    const xrRes = await fetch(`${origin}/api/xentral/articles?all=1&limit=${limit}`, {
      cache: "no-store",
    });
    const xrJson = (await xrRes.json()) as { items?: XentralArticle[]; error?: string };
    if (!xrRes.ok) {
      return NextResponse.json(
        { error: xrJson.error ?? "Xentral-Artikel konnten nicht geladen werden.", rows: [] },
        { status: 502 }
      );
    }

    const articles = xrJson.items ?? [];

    const amzRes = await fetch(`${origin}/api/amazon/products?status=active`, { cache: "no-store" });
    let amazonItems: AmazonItem[] = [];
    let amazonWarning: string | null = null;

    if (amzRes.status === 202) {
      const body = (await amzRes.json().catch(() => ({}))) as { error?: string };
      amazonWarning =
        body.error ??
        "Amazon-Produktreport wird noch erstellt. Preisabgleich für Amazon ggf. unvollständig.";
    } else if (amzRes.ok) {
      const amzJson = (await amzRes.json()) as {
        items?: Array<{ sku: string; price?: number | null }>;
        error?: string;
      };
      amazonItems = (amzJson.items ?? []).map((i) => ({
        sku: i.sku,
        price: typeof i.price === "number" && Number.isFinite(i.price) ? i.price : null,
      }));
    } else {
      const err = (await amzRes.json().catch(() => ({}))) as { error?: string };
      amazonWarning = err.error ?? `Amazon Produkte (${amzRes.status})`;
    }

    const amazonBySku = new Map<string, { price: number | null }>();
    for (const it of amazonItems) {
      const k = normSku(it.sku);
      if (k) amazonBySku.set(k, { price: it.price });
    }

    const rows: PriceParityRow[] = articles.map((a) => {
      const key = normSku(a.sku);
      const amz = key ? amazonBySku.get(key) : undefined;
      const amazonPrice = amz?.price ?? null;

      const refFromXentral =
        a.price != null && Number.isFinite(a.price) && a.price >= 0 ? a.price : null;
      const referencePrice = refFromXentral ?? amazonPrice;
      const referenceSource: "xentral" | "amazon" | null =
        refFromXentral != null ? "xentral" : amazonPrice != null ? "amazon" : null;

      let amazonState: MarketplaceCellState = "ok";
      if (!amz) amazonState = "missing";
      else if (amazonPrice == null) amazonState = "no_price";
      else if (refFromXentral != null && pricesDiffer(refFromXentral, amazonPrice)) {
        amazonState = "mismatch";
      }

      const otherMarketplaces: Record<string, { price: number | null; state: MarketplaceCellState }> =
        {};
      for (const m of ANALYTICS_MARKETPLACES) {
        otherMarketplaces[m.slug] = { price: null, state: "not_connected" };
      }

      const needsReview = amazonState !== "ok";

      return {
        sku: a.sku,
        name: a.name,
        stock: a.stock,
        referencePrice,
        referenceSource,
        amazon: { price: amazonPrice, state: amazonState },
        otherMarketplaces,
        needsReview,
      };
    });

    const issueCount = rows.filter((r) => r.needsReview).length;

    return NextResponse.json({
      meta: {
        articleCount: rows.length,
        amazonMatchedSkus: amazonBySku.size,
        amazonWarning,
        channels: {
          reference: "Xentral (Stamm) / Amazon",
          connected: ["amazon"],
          planned: ANALYTICS_MARKETPLACES.map((m) => m.slug),
        },
      },
      rows,
      issueCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message, rows: [] }, { status: 500 });
  }
}
