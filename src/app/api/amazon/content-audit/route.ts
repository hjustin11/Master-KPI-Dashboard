import { NextResponse } from "next/server";
import { runAmazonContentAudit } from "@/shared/lib/amazonContentAudit";
import {
  buildAmazonTitleProductContext,
} from "@/shared/lib/amazonTitleOptimizationContext";
import { runAmazonContentOptimization } from "@/shared/lib/amazonTitleLlmReview";
import { getAmazonMarketplaceBySlug } from "@/shared/config/amazonMarketplaces";

export const maxDuration = 120;

type ProductsPayload = {
  items?: Array<Record<string, unknown>>;
  error?: string;
};

function normSku(input: string): string {
  return input.trim().toLowerCase();
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strList(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = str(item);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function mergeStringRecord(sourceObj: unknown, draftObj: unknown): Record<string, string> {
  const read = (o: unknown): Record<string, string> => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      r[k] = str(v);
    }
    return r;
  };
  return { ...read(sourceObj), ...read(draftObj) };
}

function externalProductIdTypeRaw(value: unknown): "ean" | "upc" | "gtin" | "isbn" | "none" {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s === "ean" || s === "upc" || s === "gtin" || s === "isbn" || s === "none") return s;
  return "none";
}

function strPriceOrQty(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return str(value);
}

async function fetchJsonWithAuth(origin: string, path: string, cookieHeader: string): Promise<unknown> {
  const res = await fetch(`${origin}${path}`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(`${path}: ${err}`);
  }
  return json;
}

function extractMarketplaceHint(marketplace: string, row: Record<string, unknown>) {
  const extras =
    row.extras && typeof row.extras === "object" && !Array.isArray(row.extras)
      ? (row.extras as Record<string, unknown>)
      : {};
  return {
    marketplace,
    title: str(row.title),
    descriptionExcerpt: str(extras.description_excerpt ?? extras.description_text ?? extras.description ?? ""),
    brand: str(extras.brand ?? extras.vendor ?? extras.brand_hint ?? ""),
    productType: str(extras.product_type ?? extras.category_label ?? extras.product_line_hint ?? ""),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sku = str(url.searchParams.get("sku"));
    const forceRefresh = url.searchParams.get("refresh") === "1";
    const amazonSlug = str(url.searchParams.get("amazonSlug")) || "amazon-de";
    if (!sku) return NextResponse.json({ error: "sku ist erforderlich." }, { status: 400 });

    const marketplaceConfig = getAmazonMarketplaceBySlug(amazonSlug);
    const targetLanguageTag = marketplaceConfig?.languageTag ?? "de_DE";
    const marketplaceName = marketplaceConfig?.name ?? "Amazon.de";
    const marketplaceDomain = marketplaceConfig?.domain ?? "amazon.de";

    const origin = url.origin;
    const cookieHeader = request.headers.get("cookie") ?? "";
    const refreshSuffix = forceRefresh ? "&refresh=1" : "";
    const detailSlugQs = amazonSlug && amazonSlug !== "amazon-de" ? `&amazonSlug=${encodeURIComponent(amazonSlug)}` : "";

    const [amazonDetailRaw, shopifyRaw] = await Promise.all([
      fetchJsonWithAuth(origin, `/api/amazon/products/${encodeURIComponent(sku)}?draft=1${detailSlugQs}`, cookieHeader),
      fetchJsonWithAuth(origin, `/api/shopify/products${forceRefresh ? "?refresh=1" : ""}`, cookieHeader),
    ]);

    let rulebookMarkdown = "";
    try {
      const rulebookRaw = await fetchJsonWithAuth(origin, "/api/amazon/rulebook", cookieHeader);
      const rulebook = (rulebookRaw as { content?: unknown }).content;
      rulebookMarkdown = typeof rulebook === "string" ? rulebook : "";
    } catch {
      rulebookMarkdown = "";
    }

    const amazonDetail = amazonDetailRaw as {
      sourceSnapshot?: Record<string, unknown>;
      draftValues?: Record<string, unknown>;
    };
    const source = (amazonDetail.sourceSnapshot ?? {}) as Record<string, unknown>;
    const draft = (amazonDetail.draftValues ?? {}) as Record<string, unknown>;
    const amazon = {
      title: str(draft.title ?? source.title),
      description: str(draft.description ?? source.description),
      bulletPoints: strList(draft.bulletPoints ?? source.bulletPoints, 12),
      brand: str(draft.brand ?? source.brand),
      productType: str(draft.productType ?? source.productType),
      images: strList(draft.images ?? source.images, 20),
      asin: str(draft.asin ?? source.asin),
      externalProductId: str(draft.externalProductId ?? source.externalProductId),
      packageLength: str(draft.packageLength ?? source.packageLength),
      packageWidth: str(draft.packageWidth ?? source.packageWidth),
      packageHeight: str(draft.packageHeight ?? source.packageHeight),
      packageWeight: str(draft.packageWeight ?? source.packageWeight),
      attributes: mergeStringRecord(source.attributes, draft.attributes),
      conditionType: str(draft.conditionType ?? source.conditionType),
      externalProductIdType: externalProductIdTypeRaw(
        draft.externalProductIdType ?? source.externalProductIdType
      ),
      listPriceEur: strPriceOrQty(draft.listPriceEur ?? source.listPriceEur),
      quantity: strPriceOrQty(draft.quantity ?? source.quantity),
    };

    const shopifyItems = Array.isArray((shopifyRaw as ProductsPayload).items)
      ? ((shopifyRaw as ProductsPayload).items as Array<Record<string, unknown>>)
      : [];
    const want = normSku(sku);
    const shopifyRow = shopifyItems.find((item) => normSku(str(item.sku)) === want) ?? null;
    const shopifyExtras =
      shopifyRow?.extras && typeof shopifyRow.extras === "object" && !Array.isArray(shopifyRow.extras)
        ? (shopifyRow.extras as Record<string, unknown>)
        : {};
    const shopify = shopifyRow
      ? {
          title: str(shopifyRow.title),
          description: str(shopifyExtras.description_text),
          tags: strList(shopifyExtras.tags, 30),
          images: strList(shopifyExtras.image_urls, 20),
          storefrontUrl: str(shopifyExtras.storefront_url),
          adminProductUrl: str(shopifyExtras.admin_product_url),
          productType: str(shopifyExtras.product_type),
          vendor: str(shopifyExtras.vendor),
        }
      : null;

    const compareMarkets = [
      ["otto", "/api/otto/products"],
      ["ebay", "/api/ebay/products"],
      ["kaufland", "/api/kaufland/products"],
      ["fressnapf", "/api/fressnapf/products"],
      ["zooplus", "/api/zooplus/products"],
      ["mediamarkt-saturn", "/api/mediamarkt-saturn/products"],
    ] as const;
    const otherResults = await Promise.allSettled(
      compareMarkets.map(async ([marketplace, path]) => {
        const q = `${path}${path.includes("?") ? "&" : "?"}all=1${refreshSuffix}`;
        const raw = (await fetchJsonWithAuth(origin, q, cookieHeader)) as ProductsPayload;
        const rows = Array.isArray(raw.items) ? raw.items : [];
        const row = rows.find((item) => normSku(str(item.sku)) === want);
        if (!row) return null;
        return extractMarketplaceHint(marketplace, row);
      })
    );
    const otherMarketplaceHints = otherResults
      .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    let xentralEan: string | null = null;
    try {
      const xentralUrl = `/api/xentral/articles?q=${encodeURIComponent(sku)}&limit=150&includeSales=0&includePrices=0`;
      const xentralRaw = (await fetchJsonWithAuth(origin, xentralUrl, cookieHeader)) as {
        items?: Array<{ sku?: string; ean?: string | null }>;
      };
      const items = Array.isArray(xentralRaw.items) ? xentralRaw.items : [];
      const hit = items.find((it) => normSku(str(it.sku)) === want);
      const e = hit?.ean;
      if (typeof e === "string" && e.replace(/\D/g, "").length >= 8) {
        xentralEan = e.replace(/\D/g, "");
      }
    } catch {
      xentralEan = null;
    }

    const audit = runAmazonContentAudit({
      sku,
      rulebookMarkdown,
      amazon,
      shopify,
      otherMarketplaceHints,
    });

    const shopifyForContext = shopify
      ? {
          title: shopify.title,
          descriptionExcerpt: shopify.description.length > 3500 ? `${shopify.description.slice(0, 3500)}…` : shopify.description,
          tags: shopify.tags,
          vendor: shopify.vendor,
          productType: shopify.productType,
          storefrontUrl: shopify.storefrontUrl,
        }
      : null;
    const productContext = buildAmazonTitleProductContext({
      sku,
      amazon: {
        title: amazon.title,
        description: amazon.description,
        bulletPoints: amazon.bulletPoints,
        brand: amazon.brand,
        productType: amazon.productType,
        asin: amazon.asin,
        externalProductId: amazon.externalProductId,
        externalProductIdType: amazon.externalProductIdType,
        conditionType: amazon.conditionType,
        attributes: amazon.attributes,
      },
      shopify: shopifyForContext,
    });

    const titleOptimization = await runAmazonContentOptimization({
      productContext,
      rulebookMarkdown,
      targetLanguageTag,
      marketplaceName,
      marketplaceDomain,
    });

    let recommendations = audit.recommendations;
    if (titleOptimization.usedLlm) {
      const llmTitle = titleOptimization.improvedTitle?.trim();
      const llmBullets = titleOptimization.improvedBulletPoints;
      const llmDesc = titleOptimization.improvedDescription?.trim();
      const llmSearchTerms = titleOptimization.improvedSearchTerms?.trim();
      recommendations = {
        title: llmTitle ? llmTitle.slice(0, 200) : audit.recommendations.title,
        bulletPoints: llmBullets && llmBullets.length > 0 ? llmBullets.slice(0, 5) : audit.recommendations.bulletPoints,
        description: llmDesc || audit.recommendations.description,
        searchTerms: llmSearchTerms || audit.recommendations.searchTerms,
      };
    }

    return NextResponse.json({
      sku,
      shopify,
      amazon,
      otherMarketplaceHints,
      rulebookMarkdown,
      findings: audit.findings,
      diffs: audit.diffs,
      recommendations,
      inferredKeywords: audit.inferredKeywords,
      xentralEan,
      titleOptimization,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unbekannter Fehler." },
      { status: 500 }
    );
  }
}

