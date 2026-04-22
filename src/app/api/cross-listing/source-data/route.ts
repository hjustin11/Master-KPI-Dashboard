import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { loadMarketplaceProductRowsForPriceParity } from "@/shared/lib/marketplaceProductCachesPrime";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import { getIntegrationCachedOrLoad } from "@/shared/lib/integrationDataCache";
import {
  marketplaceIntegrationFreshMs,
  marketplaceIntegrationStaleMs,
} from "@/shared/lib/integrationCacheTtl";
import {
  computeXentralArticlesPayload,
  fetchXentralProductDetail,
  XentralArticlesPayloadError,
  type XentralArticle,
} from "@/shared/lib/xentralArticlesCompute";
import { buildXentralArticlesCacheKey } from "@/shared/lib/xentralArticlesCache";
import {
  CROSS_LISTING_TARGET_SLUGS,
  type CrossListingSourceDataResponse,
  type CrossListingSourceMap,
  type CrossListingSourceRecord,
  type CrossListingSourceSlug,
} from "@/shared/lib/crossListing/crossListingDraftTypes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normSku(s: string): string {
  return s.trim().toLowerCase();
}

function extractImages(extras?: Record<string, unknown>): string[] {
  if (!extras) return [];
  const out: string[] = [];
  const keys = ["images", "image_urls", "imageUrls", "media", "pictures", "mainImage", "image"];
  for (const k of keys) {
    const v = extras[k];
    if (Array.isArray(v)) {
      for (const u of v) if (typeof u === "string" && u.trim()) out.push(u.trim());
    } else if (typeof v === "string" && v.trim()) {
      out.push(v.trim());
    }
  }
  return Array.from(new Set(out));
}

function extractBullets(extras?: Record<string, unknown>): string[] {
  if (!extras) return [];
  const keys = ["bullets", "bullet_points", "bulletPoints", "features", "highlights"];
  for (const k of keys) {
    const v = extras[k];
    if (Array.isArray(v)) {
      return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter((s) => s.length > 0);
    }
  }
  return [];
}

function extractDescription(extras?: Record<string, unknown>): string | null {
  if (!extras) return null;
  const keys = [
    "description",
    "description_text",
    "descriptionText",
    "longDescription",
    "description_html",
    "body_html",
    "summary",
  ];
  for (const k of keys) {
    const v = extras[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function extractEan(slug: CrossListingSourceSlug, row: MarketplaceProductListRow): string | null {
  // Shopify: secondaryId ist die Produkt-ID (13-stellig numerisch) — NIE EAN.
  // Echte Shopify-Barcode liegt in extras.variant_barcode.
  if (slug !== "shopify") {
    const secondary = row.secondaryId?.trim() ?? "";
    if (/^\d{8,14}$/.test(secondary)) return secondary;
  }
  const extras = row.extras;
  if (!extras) return null;
  const keys = slug === "shopify"
    ? ["variant_barcode", "ean", "gtin", "barcode", "EAN"]
    : ["ean", "gtin", "barcode", "EAN"];
  for (const k of keys) {
    const v = extras[k];
    if (typeof v === "string" && /^\d{8,14}$/.test(v.trim())) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) {
      const s = String(v);
      if (/^\d{8,14}$/.test(s)) return s;
    }
  }
  return null;
}

function extractAttributes(extras?: Record<string, unknown>): Record<string, string> {
  if (!extras) return {};
  const attrs = extras.attributes;
  const out: Record<string, string> = {};
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
    for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
      else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
    }
  }
  return out;
}

function extractStringKey(extras: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!extras) return null;
  for (const k of keys) {
    const v = extras[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function extractNumberKey(extras: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!extras) return null;
  for (const k of keys) {
    const v = extras[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function extractTags(extras: Record<string, unknown> | undefined): string[] {
  if (!extras) return [];
  for (const k of ["tags", "tag_list"]) {
    const v = extras[k];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (typeof v === "string" && v.trim()) return v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function rowToSourceRecord(
  slug: CrossListingSourceSlug,
  row: MarketplaceProductListRow
): CrossListingSourceRecord {
  const extras = row.extras;
  return {
    slug,
    title: row.title?.trim() || null,
    description: extractDescription(extras),
    bullets: extractBullets(extras),
    images: extractImages(extras),
    priceEur: row.priceEur ?? null,
    uvpEur: extractNumberKey(extras, ["uvp", "uvpEur", "listPriceEur", "msrp"]),
    stockQty: row.stockQty ?? null,
    ean: extractEan(slug, row),
    brand: extractStringKey(extras, ["brand", "manufacturer", "vendor", "Marke"]),
    category: extractStringKey(extras, ["category", "categoryPath", "product_type", "productType"]),
    dimL: extractNumberKey(extras, ["length", "packageLength", "dimL"]),
    dimW: extractNumberKey(extras, ["width", "packageWidth", "dimW"]),
    dimH: extractNumberKey(extras, ["height", "packageHeight", "dimH"]),
    weight: extractNumberKey(extras, ["weight", "packageWeight", "weightKg"]),
    petSpecies: extractStringKey(extras, ["petSpecies", "animal", "Tierart"]),
    tags: extractTags(extras),
    attributes: extractAttributes(extras),
    raw: extras,
  };
}

type AmazonDetailEnriched = {
  title: string;
  description: string;
  bullets: string[];
  images: string[];
  brand: string;
  attributes: Record<string, string>;
};

async function enrichAmazonSourceFromDetail(args: {
  sku: string;
  cookieHeader: string;
  origin: string;
}): Promise<AmazonDetailEnriched | null> {
  try {
    const url = `${args.origin}/api/amazon/products/${encodeURIComponent(args.sku)}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: args.cookieHeader ? { cookie: args.cookieHeader } : {},
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as
      | {
          sourceSnapshot?: {
            title?: string;
            description?: string;
            bulletPoints?: string[];
            images?: string[];
            brand?: string;
            attributes?: Record<string, string>;
          };
        }
      | null;
    const s = body?.sourceSnapshot;
    if (!s) return null;
    return {
      title: s.title ?? "",
      description: s.description ?? "",
      bullets: Array.isArray(s.bulletPoints) ? s.bulletPoints.filter((b) => typeof b === "string" && b.trim()) : [],
      images: Array.isArray(s.images) ? s.images.filter((u) => typeof u === "string" && u.trim()) : [],
      brand: s.brand ?? "",
      attributes: s.attributes ?? {},
    };
  } catch {
    return null;
  }
}

async function loadSourceForSlug(args: {
  slug: CrossListingSourceSlug;
  sku: string;
  cookieHeader: string;
  origin: string;
}): Promise<CrossListingSourceRecord | null> {
  const LOG_TAG = `[cross-listing source-data slug=${args.slug} sku=${args.sku}]`;
  try {
    const rows = await loadMarketplaceProductRowsForPriceParity(args.slug, false);
    if (!rows) {
      console.info(`${LOG_TAG} no rows loaded (config missing or cache-miss)`);
      return null;
    }
    const match = rows.find((r) => normSku(r.sku) === args.sku);
    if (!match) {
      console.info(`${LOG_TAG} no SKU match in ${rows.length} rows`);
      return null;
    }
    const rec = rowToSourceRecord(args.slug, match);
    console.info(
      `${LOG_TAG} matched (original-sku=${match.sku}): title=${Boolean(rec.title)}, desc=${Boolean(rec.description)}, bullets=${rec.bullets.length}, images=${rec.images.length}, ean=${rec.ean ?? "null"}`
    );
    // Amazon Listrows enthalten keine Description/Bullets/Images.
    // Per-SKU-Detail liefert diese Felder (via /api/amazon/products/[sku]).
    if (args.slug === "amazon") {
      // Original-SKU (nicht lowercased) an den Amazon-Detail-Endpoint reichen —
      // Amazon-SKUs sind case-sensitive in der SP-API.
      const enriched = await enrichAmazonSourceFromDetail({
        sku: match.sku,
        cookieHeader: args.cookieHeader,
        origin: args.origin,
      });
      if (enriched) {
        console.info(
          `${LOG_TAG} amazon enrichment: desc=${Boolean(enriched.description)}, bullets=${enriched.bullets.length}, images=${enriched.images.length}, attrs=${Object.keys(enriched.attributes).length}`
        );
        return {
          ...rec,
          title: enriched.title || rec.title,
          description: enriched.description || rec.description,
          bullets: enriched.bullets.length > 0 ? enriched.bullets : rec.bullets,
          images: enriched.images.length > 0 ? enriched.images : rec.images,
          brand: enriched.brand || rec.brand,
          attributes:
            Object.keys(enriched.attributes).length > 0
              ? enriched.attributes
              : rec.attributes,
        };
      } else {
        console.warn(`${LOG_TAG} amazon enrichment returned null (per-SKU detail fetch failed)`);
      }
    }
    return rec;
  } catch (err) {
    console.error(`${LOG_TAG} loader threw:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function xentralArticleToSourceRecord(article: XentralArticle): CrossListingSourceRecord {
  return {
    slug: "xentral",
    title: article.name?.trim() || null,
    description: null,
    bullets: [],
    images: [],
    priceEur: article.salesPrice ?? article.price ?? null,
    uvpEur: article.salesPrice ?? null,
    stockQty: Number.isFinite(article.stock) ? article.stock : null,
    ean: article.ean,
    brand: article.brand,
    category: article.category,
    dimL: article.dimL,
    dimW: article.dimW,
    dimH: article.dimH,
    weight: article.weight,
    petSpecies: null,
    tags: [],
    attributes: {},
    raw: { xentralId: article.projectId ?? null },
  };
}

async function loadXentralSource(
  skuOriginal: string,
  skuKey: string
): Promise<CrossListingSourceRecord | null> {
  const LOG_TAG = `[cross-listing xentral sku=${skuKey}]`;
  try {
    const baseUrl = await getIntegrationSecretValue("XENTRAL_BASE_URL");
    const token =
      (await getIntegrationSecretValue("XENTRAL_PAT")) ||
      (await getIntegrationSecretValue("XENTRAL_KEY"));
    if (!baseUrl || !token) {
      console.warn(
        `${LOG_TAG} SKIP: secrets missing (baseUrl=${Boolean(baseUrl)}, token=${Boolean(token)})`
      );
      return null;
    }

    // Zwei Queries: 1) Original-Case, 2) Lowercase — Xentral-Instanzen verhalten
    // sich unterschiedlich case-sensitive. Wir matchen danach normalisiert.
    const queries = skuOriginal !== skuKey ? [skuOriginal, skuKey] : [skuOriginal];
    let match: XentralArticle | null = null;
    for (const q of queries) {
      const computeArgs = {
        baseUrl,
        token,
        query: q,
        fetchAll: false,
        includePrices: true,
        includeSales: false,
        pageSize: 200,
        pageNumber: 1,
        salesFromYmd: null,
        salesToYmd: null,
      };
      const cacheKey = buildXentralArticlesCacheKey(computeArgs);
      const payload = await getIntegrationCachedOrLoad({
        cacheKey,
        source: "xentral:articles",
        freshMs: marketplaceIntegrationFreshMs(),
        staleMs: marketplaceIntegrationStaleMs(),
        loader: () => computeXentralArticlesPayload(computeArgs),
      });
      console.info(`${LOG_TAG} Xentral returned ${payload.items.length} items for query="${q}"`);
      let hit = payload.items.find((a) => normSku(a.sku) === skuKey);
      if (!hit) {
        hit = payload.items.find(
          (a) => normSku(a.sku).endsWith(skuKey) || skuKey.endsWith(normSku(a.sku))
        );
        if (hit) console.info(`${LOG_TAG} used loose match: xentral-sku="${hit.sku}"`);
      }
      if (hit) {
        match = hit;
        break;
      }
      if (payload.items.length > 0) {
        const first5 = payload.items.slice(0, 5).map((a) => a.sku).join(", ");
        console.warn(`${LOG_TAG} query="${q}" no match. First 5 SKUs: [${first5}]`);
      }
    }
    if (!match) return null;
    console.info(
      `${LOG_TAG} LIST-MATCH: ean=${match.ean ?? "(null)"}, brand=${match.brand ?? "(null)"}, dimL=${match.dimL ?? "(null)"}, dimW=${match.dimW ?? "(null)"}, dimH=${match.dimH ?? "(null)"}, weight=${match.weight ?? "(null)"}`
    );

    // Fallback: Wenn EAN oder Dimensionen in der Listen-Antwort fehlen,
    // per Detail-Endpoint `/api/v1/products/{id}` nachziehen.
    const needsDetail =
      !match.ean ||
      match.dimL == null ||
      match.dimW == null ||
      match.dimH == null ||
      match.weight == null;
    if (needsDetail && match.xentralProductId) {
      try {
        const detail = await fetchXentralProductDetail({
          baseUrl,
          token,
          productId: match.xentralProductId,
        });
        const enriched: XentralArticle = {
          ...match,
          ean: match.ean ?? detail.ean,
          brand: match.brand ?? detail.brand,
          dimL: match.dimL ?? detail.dimL,
          dimW: match.dimW ?? detail.dimW,
          dimH: match.dimH ?? detail.dimH,
          weight: match.weight ?? detail.weight,
          category: match.category ?? detail.category,
        };
        console.info(
          `${LOG_TAG} DETAIL-ENRICHED: ean=${enriched.ean ?? "(null)"}, dimL=${enriched.dimL ?? "(null)"}, dimW=${enriched.dimW ?? "(null)"}, dimH=${enriched.dimH ?? "(null)"}, weight=${enriched.weight ?? "(null)"}`
        );
        return xentralArticleToSourceRecord(enriched);
      } catch (detailErr) {
        console.warn(
          `${LOG_TAG} detail fetch failed (fallback to list data):`,
          detailErr instanceof Error ? detailErr.message : detailErr
        );
      }
    }

    return xentralArticleToSourceRecord(match);
  } catch (err) {
    if (err instanceof XentralArticlesPayloadError) {
      // Body enthält error-message + Preview von Xentral
      console.error(
        `${LOG_TAG} FAILED: XentralArticlesPayloadError status=${err.status}`,
        JSON.stringify(err.body, null, 2)
      );
    } else {
      console.error(`${LOG_TAG} FAILED:`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const url = new URL(request.url);
  const skuRaw = url.searchParams.get("sku") ?? "";
  const sku = skuRaw.trim();
  if (!sku) {
    return NextResponse.json({ error: "Query-Parameter 'sku' erforderlich." }, { status: 400 });
  }

  const skuKey = normSku(sku);
  const slugs = CROSS_LISTING_TARGET_SLUGS;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const origin = url.origin;

  // Xentral ist die Single-Source-of-Truth für EAN + Maße + Brand.
  // Timeout großzügig (20 s), damit EAN auch bei Cache-Miss ausgefüllt ankommt.
  // WICHTIG: Query mit Original-SKU-Case (nicht lowercased) — Xentral-Search
  // ist case-sensitive für manche Instanzen.
  const XENTRAL_TIMEOUT_MS = 20000;
  const xentralWithTimeout: Promise<CrossListingSourceRecord | null> = Promise.race([
    loadXentralSource(sku, skuKey),
    new Promise<null>((resolve) =>
      setTimeout(() => {
        console.warn(`[cross-listing source-data sku=${skuKey}] Xentral timeout after ${XENTRAL_TIMEOUT_MS}ms`);
        resolve(null);
      }, XENTRAL_TIMEOUT_MS)
    ),
  ]);

  const settled = await Promise.allSettled([
    runWithConcurrency(slugs, 3, (slug) =>
      loadSourceForSlug({ slug, sku: skuKey, cookieHeader, origin })
    ),
    xentralWithTimeout,
  ]);

  const marketplaceRecords: Array<CrossListingSourceRecord | null> =
    settled[0].status === "fulfilled" ? settled[0].value : slugs.map(() => null);
  if (settled[0].status === "rejected") {
    console.error("[cross-listing source-data] marketplace loader rejected:", settled[0].reason);
  }
  const xentralRecord: CrossListingSourceRecord | null =
    settled[1].status === "fulfilled" ? settled[1].value : null;
  if (settled[1].status === "rejected") {
    console.error("[cross-listing source-data] xentral loader rejected:", settled[1].reason);
  }

  const sources: CrossListingSourceMap = {};
  // EAN-Top-Level: Xentral bevorzugt, sonst irgend eine Marktplatz-EAN
  // (wird beim Dialog zum Speichern in cross_listing_drafts.ean geschrieben).
  let ean: string | null = null;
  if (xentralRecord) {
    sources.xentral = xentralRecord;
    if (xentralRecord.ean) ean = xentralRecord.ean;
  }
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const rec = marketplaceRecords[i];
    sources[slug] = rec;
    if (!ean && rec?.ean) ean = rec.ean;
  }

  const payload: CrossListingSourceDataResponse = { sku, ean, sources };
  return NextResponse.json(payload);
}
