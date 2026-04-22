import { NextResponse } from "next/server";
import { primeAmazonOrdersForYmdRange } from "@/app/api/amazon/orders/route";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { primeMarketplaceProductListFull } from "@/shared/lib/marketplaceProductCachesPrime";
import {
  FLEX_MARKETPLACE_EBAY_SPEC,
  FLEX_MARKETPLACE_MMS_SPEC,
  FLEX_MARKETPLACE_SHOPIFY_SPEC,
  FLEX_MARKETPLACE_TIKTOK_SPEC,
  FLEX_MARKETPLACE_ZOOPLUS_SPEC,
  flexMissingKeysForConfig,
  getFlexIntegrationConfig,
  primeFlexOrdersCaches,
} from "@/shared/lib/flexMarketplaceApiClient";
import { fetchFressnapfOrdersPaginated, getFressnapfIntegrationConfig } from "@/shared/lib/fressnapfApiClient";
import { fetchKauflandOrderUnitsAllStatuses, getKauflandIntegrationConfig } from "@/shared/lib/kauflandApiClient";
import { toDateInputValue, ymdToUtcRangeExclusiveEnd } from "@/shared/lib/orderDateParams";
import { fetchOttoOrdersRange, getOttoAccessToken, getOttoIntegrationConfig } from "@/shared/lib/ottoApiClient";

export const maxDuration = 300;

type Resource = "orders" | "products" | "both";

const FLEX_BY_SLUG: Record<string, (typeof FLEX_MARKETPLACE_SHOPIFY_SPEC) | undefined> = {
  shopify: FLEX_MARKETPLACE_SHOPIFY_SPEC,
  ebay: FLEX_MARKETPLACE_EBAY_SPEC,
  tiktok: FLEX_MARKETPLACE_TIKTOK_SPEC,
  zooplus: FLEX_MARKETPLACE_ZOOPLUS_SPEC,
  "mediamarkt-saturn": FLEX_MARKETPLACE_MMS_SPEC,
};

function defaultOrderRangeYmd(): { fromYmd: string; toYmd: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return { fromYmd: toDateInputValue(start), toYmd: toDateInputValue(end) };
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

  let body: { marketplace?: string; resource?: Resource; fromYmd?: string; toYmd?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const marketplace = String(body.marketplace ?? "")
    .trim()
    .toLowerCase();
  const resource: Resource = body.resource === "products" || body.resource === "both" ? body.resource : "orders";
  if (!marketplace) {
    return NextResponse.json({ error: "marketplace ist erforderlich." }, { status: 400 });
  }

  let fromYmd = body.fromYmd?.trim() ?? "";
  let toYmd = body.toYmd?.trim() ?? "";
  if (!fromYmd || !toYmd) {
    const d = defaultOrderRangeYmd();
    fromYmd = d.fromYmd;
    toYmd = d.toYmd;
  }
  if (fromYmd > toYmd) {
    return NextResponse.json({ error: "fromYmd muss ≤ toYmd sein." }, { status: 400 });
  }

  const { startMs, endMs } = ymdToUtcRangeExclusiveEnd(fromYmd, toYmd);
  const results: Record<string, unknown> = { marketplace, resource, fromYmd, toYmd };

  try {
    if (resource === "orders" || resource === "both") {
      const flexSpec = FLEX_BY_SLUG[marketplace];
      if (flexSpec) {
        const config = await getFlexIntegrationConfig(flexSpec);
        const missing = flexMissingKeysForConfig(config).filter((x) => x.missing);
        if (missing.length > 0) {
          results.orders = { ok: false, error: "Konfiguration unvollständig.", missingKeys: missing.map((m) => m.key) };
        } else {
          const pr = await primeFlexOrdersCaches(config, { fromYmd, toYmd });
          results.orders = { ok: true, ...pr };
        }
      } else if (marketplace === "fressnapf") {
        const cfg = await getFressnapfIntegrationConfig();
        if (!cfg.baseUrl || !cfg.apiKey) {
          results.orders = { ok: false, error: "Fressnapf nicht konfiguriert." };
        } else {
          const rows = await fetchFressnapfOrdersPaginated(cfg, { fromYmd, toYmd, forceRefresh: true });
          const inRange = rows.filter((o) => {
            const t = Date.parse(o.createdAt);
            return !Number.isNaN(t) && t >= startMs && t < endMs;
          });
          results.orders = { ok: true, count: inRange.length, primedTotal: rows.length };
        }
      } else if (marketplace === "otto") {
        const cfg = await getOttoIntegrationConfig();
        if (!cfg.clientId || !cfg.clientSecret) {
          results.orders = { ok: false, error: "Otto nicht konfiguriert." };
        } else {
          const token = await getOttoAccessToken(cfg);
          const orders = await fetchOttoOrdersRange({
            baseUrl: cfg.baseUrl,
            token,
            startMs,
            endMs,
            fromYmd,
            toYmd,
            forceRefresh: true,
          });
          results.orders = { ok: true, count: orders.length };
        }
      } else if (marketplace === "kaufland") {
        const cfg = await getKauflandIntegrationConfig();
        if (!cfg.clientKey || !cfg.secretKey) {
          results.orders = { ok: false, error: "Kaufland nicht konfiguriert." };
        } else {
          const units = await fetchKauflandOrderUnitsAllStatuses({ config: cfg, forceRefresh: true });
          results.orders = { ok: true, count: units.length };
        }
      } else if (marketplace === "amazon" || marketplace.startsWith("amazon-")) {
        const ar = await primeAmazonOrdersForYmdRange(fromYmd, toYmd);
        results.orders = ar;
      } else {
        results.orders = { ok: false, error: `Unbekannter Marktplatz: ${marketplace}` };
      }
    }

    if (resource === "products" || resource === "both") {
      results.products = await primeMarketplaceProductListFull(marketplace);
    }

    const ordersResult = results.orders as { ok?: boolean } | undefined;
    const productsResult = results.products as { ok?: boolean; skipped?: string } | undefined;
    const ordersFailed =
      (resource === "orders" || resource === "both") && ordersResult && ordersResult.ok === false;
    const productsFailed =
      (resource === "products" || resource === "both") &&
      productsResult &&
      productsResult.ok === false &&
      !productsResult.skipped;

    if (ordersFailed || productsFailed) {
      const orderErr =
        ordersResult && typeof ordersResult === "object" && "error" in ordersResult
          ? String((ordersResult as { error?: string }).error ?? "")
          : "";
      const productErr =
        productsResult && typeof productsResult === "object" && "error" in productsResult
          ? String((productsResult as { error?: string }).error ?? "")
          : "";
      const error =
        orderErr || productErr || "Synchronisation fehlgeschlagen.";
      return NextResponse.json({ ok: false, error, ...results }, { status: 502 });
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
