import { NextResponse } from "next/server";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";
import { createAdminClient } from "@/shared/lib/supabase/admin";

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

type OttoAmount = { amount?: number | string };
type OttoPositionItem = {
  product?: { sku?: string };
  item_value_reduced_gross_price?: OttoAmount;
  itemValueReducedGrossPrice?: OttoAmount;
  item_value_gross_price?: OttoAmount;
  itemValueGrossPrice?: OttoAmount;
};
type OttoOrder = {
  order_date?: string;
  orderDate?: string;
  position_items?: OttoPositionItem[];
  positionItems?: OttoPositionItem[];
};
type OttoOrdersPayload = {
  resources?: OttoOrder[];
  links?: Array<{ href?: string; rel?: string }>;
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

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function getSupabaseSecret(key: string): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("integration_secrets")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) return "";
    return typeof data?.value === "string" ? data.value.trim() : "";
  } catch {
    return "";
  }
}

function resolveBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "https://api.otto.market";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, "");
  return `https://${trimmed.replace(/\/+$/, "")}`;
}

async function fetchOttoLatestSkuPrices(): Promise<{
  bySku: Map<string, number | null>;
  warning: string | null;
}> {
  const clientId = env("OTTO_API_CLIENT_ID") || (await getSupabaseSecret("OTTO_API_CLIENT_ID"));
  const clientSecret =
    env("OTTO_API_CLIENT_SECRET") || (await getSupabaseSecret("OTTO_API_CLIENT_SECRET"));
  if (!clientId || !clientSecret) {
    return { bySku: new Map(), warning: null };
  }

  const baseUrl = resolveBaseUrl(env("OTTO_API_BASE_URL") || (await getSupabaseSecret("OTTO_API_BASE_URL")));
  const scopes =
    env("OTTO_API_SCOPES") || (await getSupabaseSecret("OTTO_API_SCOPES")) || "orders";

  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: scopes,
  });
  const tokenRes = await fetch(`${baseUrl}/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
    cache: "no-store",
  });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
  const token = tokenJson.access_token;
  if (!tokenRes.ok || !token) {
    return { bySku: new Map(), warning: `Otto Token (${tokenRes.status})` };
  }

  const endMs = Date.now();
  const startMs = endMs - 60 * 24 * 60 * 60 * 1000;
  const fromIso = new Date(startMs).toISOString();
  const toIso = new Date(endMs).toISOString();

  const bySku = new Map<string, { price: number | null; date: string }>();
  let nextHref: string | undefined;

  for (let guard = 0; guard < 30; guard += 1) {
    const url = nextHref ? new URL(nextHref, baseUrl) : new URL("/v4/orders", baseUrl);
    if (!nextHref) {
      url.searchParams.set("fromOrderDate", fromIso);
      url.searchParams.set("toOrderDate", toIso);
      url.searchParams.set("orderColumnType", "ORDER_DATE");
      url.searchParams.set("limit", "128");
    }
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Request-Timestamp": new Date().toISOString(),
      },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as OttoOrdersPayload;
    if (!res.ok) {
      return { bySku: new Map(), warning: `Otto Orders (${res.status})` };
    }

    for (const order of json.resources ?? []) {
      const orderDate = (order.order_date ?? order.orderDate ?? "").slice(0, 10);
      const items = Array.isArray(order.position_items)
        ? order.position_items
        : Array.isArray(order.positionItems)
          ? order.positionItems
          : [];
      for (const item of items) {
        const sku = item.product?.sku?.trim();
        if (!sku) continue;
        const k = normSku(sku);
        const reduced = item.item_value_reduced_gross_price ?? item.itemValueReducedGrossPrice;
        const gross = item.item_value_gross_price ?? item.itemValueGrossPrice;
        const amount = toNumber((reduced ?? gross)?.amount ?? NaN);
        const price = Number.isFinite(amount) && amount > 0 ? amount : null;
        const prev = bySku.get(k);
        if (!prev || orderDate >= prev.date) {
          bySku.set(k, { price, date: orderDate });
        }
      }
    }

    nextHref = (json.links ?? []).find((l) => l?.rel === "next")?.href;
    if (!nextHref) break;
  }

  return {
    bySku: new Map(Array.from(bySku.entries()).map(([k, v]) => [k, v.price])),
    warning: null,
  };
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

    const otto = await fetchOttoLatestSkuPrices();
    const ottoBySku = otto.bySku;

    const ottoConnected = ottoBySku.size > 0;
    const rows: PriceParityRow[] = articles.map((a) => {
      const key = normSku(a.sku);
      const amz = key ? amazonBySku.get(key) : undefined;
      const amazonPrice = amz?.price ?? null;
      const ottoPrice = key ? (ottoBySku.get(key) ?? null) : null;

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
      if (ottoBySku.size > 0) {
        let ottoState: MarketplaceCellState = "ok";
        if (!key || !ottoBySku.has(key)) ottoState = "missing";
        else if (ottoPrice == null) ottoState = "no_price";
        else if (refFromXentral != null && pricesDiffer(refFromXentral, ottoPrice)) {
          ottoState = "mismatch";
        }
        otherMarketplaces.otto = { price: ottoPrice, state: ottoState };
      }

      const needsReview =
        amazonState !== "ok" ||
        (ottoConnected && otherMarketplaces.otto.state !== "ok");

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
        ottoWarning: otto.warning,
        channels: {
          reference: "Xentral (Stamm) / Amazon",
          connected: [
            "amazon",
            ...(ottoBySku.size > 0 ? ["otto"] : []),
          ],
          planned: ANALYTICS_MARKETPLACES
            .map((m) => m.slug)
            .filter((slug) => slug !== "otto" || ottoBySku.size === 0),
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
