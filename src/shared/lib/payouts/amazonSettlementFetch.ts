import {
  getAmazonProductsLwaToken,
  loadAmazonSpApiProductsConfig,
  spApiRequest,
  type AmazonSpApiProductsConfig,
} from "@/shared/lib/amazonProductsSpApiCatalog";
import type { PayoutProductEntry } from "./payoutTypes";

const LOG = "[payouts:amazon]";

function normalizeHost(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function isSandbox() {
  const v = (process.env.AMAZON_SP_API_SANDBOX ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

function resolveEndpoint(config: AmazonSpApiProductsConfig): string {
  const base = normalizeHost(config.endpoint);
  if (isSandbox() && !base.startsWith("sandbox.")) {
    return `sandbox.${base}`;
  }
  return base;
}

type SpApiBase = {
  endpoint: string;
  region: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  lwaAccessToken: string;
};

async function buildBaseArgs(): Promise<{ base: SpApiBase; config: AmazonSpApiProductsConfig }> {
  const config = await loadAmazonSpApiProductsConfig();
  if (!config.refreshToken || !config.lwaClientId || !config.lwaClientSecret) {
    throw new Error("Amazon SP-API nicht konfiguriert (LWA-Credentials fehlen).");
  }
  const lwaAccessToken = await getAmazonProductsLwaToken(config);
  return {
    base: {
      endpoint: resolveEndpoint(config),
      region: config.region,
      awsAccessKeyId: config.awsAccessKeyId,
      awsSecretAccessKey: config.awsSecretAccessKey,
      awsSessionToken: config.awsSessionToken || undefined,
      lwaAccessToken,
    },
    config,
  };
}

type SettlementReportMeta = {
  reportId: string;
  reportDocumentId: string | null;
  dataStartTime: string;
  dataEndTime: string;
  processingStatus: string;
};

/**
 * Listet alle verfügbaren Settlement-Reports (DONE) der letzten N Tage.
 * Optional: nur Reports einer bestimmten Amazon-Marketplace-ID.
 *
 * Wichtig: Settlement-Reports sind IMMER pro Marketplace. Ein Report enthält
 * nur Transaktionen eines einzigen Landes. Der Filter ist also notwendig,
 * wenn wir pro Country-Slug die richtigen Reports synchronisieren wollen.
 */
export async function listAvailableSettlements(
  sinceDaysAgo = 90,
  marketplaceIdFilter?: string
): Promise<SettlementReportMeta[]> {
  const { base } = await buildBaseArgs();
  const since = new Date(Date.now() - sinceDaysAgo * 86_400_000).toISOString();

  const query: Record<string, string> = {
    reportTypes: "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2",
    processingStatuses: "DONE",
    createdSince: since,
    pageSize: "25",
  };
  if (marketplaceIdFilter) {
    query.marketplaceIds = marketplaceIdFilter;
  }

  const res = await spApiRequest({
    ...base,
    method: "GET",
    path: "/reports/2021-06-30/reports",
    query,
  });

  if (!res.res.ok) {
    console.error(`${LOG} list reports failed: HTTP ${res.res.status}`, res.text.slice(0, 500));
    throw new Error(`Amazon Reports API: HTTP ${res.res.status}`);
  }

  const body = res.json as { reports?: Array<Record<string, unknown>> } | null;
  const reports = body?.reports ?? [];

  return reports.map((r) => ({
    reportId: String(r.reportId ?? ""),
    reportDocumentId: typeof r.reportDocumentId === "string" ? r.reportDocumentId : null,
    dataStartTime: String(r.dataStartTime ?? ""),
    dataEndTime: String(r.dataEndTime ?? ""),
    processingStatus: String(r.processingStatus ?? ""),
  }));
}

/** SP-API-Request mit 429-Retry (max 3 Versuche, exponential backoff). */
async function spApiRequestWithRetry(
  base: SpApiBase,
  opts: { method: "GET" | "POST"; path: string; query: Record<string, string>; body?: string; contentType?: string },
  maxRetries = 3
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await spApiRequest({ ...base, ...opts });
    if (res.res.status !== 429) return res;
    const delay = Math.min(60_000 * Math.pow(2, attempt), 180_000);
    console.warn(`${LOG} 429 on ${opts.path}, retry in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, delay));
  }
  return spApiRequest({ ...base, ...opts });
}

/** fetch() mit 429-Retry für S3-Downloads. */
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status !== 429 && res.ok) return res;
    if (res.status === 429) {
      const delay = Math.min(60_000 * Math.pow(2, attempt), 180_000);
      console.warn(`${LOG} 429 on TSV download, retry in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    throw new Error(`TSV-Download: HTTP ${res.status}`);
  }
  const last = await fetch(url, { cache: "no-store" });
  if (!last.ok) throw new Error(`TSV-Download: HTTP ${last.status} (after retries)`);
  return last;
}

/**
 * Lädt ein einzelnes Settlement-Report-Dokument (TSV) herunter und parst es.
 */
export async function downloadAndParseSettlement(
  reportDocumentId: string
): Promise<ParsedSettlement> {
  const { base } = await buildBaseArgs();

  const docRes = await spApiRequestWithRetry(base, {
    method: "GET",
    path: `/reports/2021-06-30/documents/${encodeURIComponent(reportDocumentId)}`,
    query: {},
  });

  if (!docRes.res.ok) {
    throw new Error(`Amazon Report-Document: HTTP ${docRes.res.status}`);
  }

  const docBody = docRes.json as { url?: string; compressionAlgorithm?: string } | null;
  const downloadUrl = docBody?.url;
  if (!downloadUrl) throw new Error("Report-Document URL fehlt.");

  const tsvRes = await fetchWithRetry(downloadUrl);
  const tsvText = await tsvRes.text();

  return parseSettlementTsv(tsvText);
}

// --- TSV Parser ---

export type ParsedSettlement = {
  settlementId: string;
  periodFrom: string;
  periodTo: string;
  grossSales: number;
  refundsAmount: number;
  refundsFeesReturned: number;
  marketplaceFees: number;
  fulfillmentFees: number;
  advertisingFees: number;
  shippingFees: number;
  promotionDiscounts: number;
  otherFees: number;
  otherFeesBreakdown: Record<string, number>;
  reserveAmount: number;
  netPayout: number;
  ordersCount: number;
  returnsCount: number;
  unitsSold: number;
  productBreakdown: PayoutProductEntry[];
};

const MARKETPLACE_FEE_TYPES = new Set([
  "Commission", "ReferralFee", "Referral Fee", "VariableClosingFee",
  "DigitalProductTax",
]);
const FULFILLMENT_FEE_TYPES = new Set([
  "FBAPerUnitFulfillmentFee", "FBAPerOrderFulfillmentFee", "FBAWeightBasedFee",
  "FBAPeakPerUnitFulfillmentFee", "FBAInboundTransportationFee",
  "FBALongTermStorageFee", "FBAStorageFee",
]);
const ADVERTISING_TYPES = new Set([
  "CostOfAdvertising", "SponsoredProducts", "SponsoredBrands", "SponsoredDisplay",
]);
const SHIPPING_FEE_TYPES = new Set([
  "ShippingHB", "ShippingChargeback",
]);

/** Konvertiert "DD.MM.YYYY" → "YYYY-MM-DD", lässt ISO-Daten unverändert. */
function parseDate(raw: string): string {
  const s = raw.trim();
  // Deutsches Format: DD.MM.YYYY oder DD.MM.YYYY HH:MM:SS
  const deMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (deMatch) {
    return `${deMatch[3]}-${deMatch[2].padStart(2, "0")}-${deMatch[1].padStart(2, "0")}`;
  }
  // ISO: YYYY-MM-DD… → slice
  return s.slice(0, 10);
}

/** Parst Betrag: "1,234.56", "1.234,56", "-36.159,16", "€ 1.234 €" → Number */
function parseAmount(raw: string): number {
  if (!raw) return 0;
  // Entferne alles außer Ziffern, Punkt, Komma, Minus
  const cleaned = raw.replace(/[^\d,.\-]/g, "").trim();
  if (!cleaned) return 0;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      // Deutsch: 1.234,56 → Tausender-Punkt weg, Komma→Punkt
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // Englisch: 1,234.56 → Komma-Tausender weg
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Nur Komma: Dezimaltrenner (1234,56) oder Tausender (1,234)?
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      // 2 oder weniger Nachkommastellen → Dezimal
      normalized = cleaned.replace(",", ".");
    } else if (parts.length === 2 && parts[1].length === 3 && !parts[0].includes("-")) {
      // Genau 3 Ziffern → mehrdeutig, nehme Dezimal (Amazon-TSV meist 2 Nachkomma)
      normalized = cleaned.replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else {
    normalized = cleaned;
  }

  const num = parseFloat(normalized);
  if (!Number.isFinite(num)) return 0;
  // Plausibilitäts-Check: kein Einzelbetrag > 100 Mio
  if (Math.abs(num) > 100_000_000) {
    console.warn(`${LOG} Suspicious amount: "${raw}" → ${num}, capped to 0`);
    return 0;
  }
  return num;
}

function parseSettlementTsv(tsv: string): ParsedSettlement {
  const lines = tsv.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("Settlement TSV leer oder ungültig.");

  const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ""));
  const idx = (name: string) => headers.indexOf(name);

  const iSettlementId = idx("settlement-id");
  const iStartDate = idx("settlement-start-date");
  const iEndDate = idx("settlement-end-date");
  const iTransType = idx("transaction-type");
  const iAmountType = idx("amount-type");
  const iAmountDesc = idx("amount-description");
  const iAmount = idx("amount");
  const iSku = idx("sku");
  const iQuantity = idx("quantity-purchased");
  const iOrderId = idx("order-id");

  let settlementId = "";
  let periodFrom = "";
  let periodTo = "";
  let grossSales = 0;
  let refundsAmount = 0;
  let refundsFeesReturned = 0;
  let marketplaceFees = 0;
  let fulfillmentFees = 0;
  let advertisingFees = 0;
  let shippingFees = 0;
  let promotionDiscounts = 0;
  let otherFees = 0;
  let reserveAmount = 0;
  const otherFeesBreakdown: Record<string, number> = {};
  const orderIds = new Set<string>();
  const returnOrderIds = new Set<string>();
  const skuMap = new Map<string, PayoutProductEntry>();
  let unitsSold = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    if (cols.length < headers.length) continue;

    if (!settlementId && iSettlementId >= 0) settlementId = cols[iSettlementId]?.trim() ?? "";
    if (!periodFrom && iStartDate >= 0) periodFrom = parseDate(cols[iStartDate] ?? "");
    if (!periodTo && iEndDate >= 0) periodTo = parseDate(cols[iEndDate] ?? "");

    const transType = cols[iTransType]?.trim() ?? "";
    const amountType = cols[iAmountType]?.trim() ?? "";
    const amountDesc = cols[iAmountDesc]?.trim() ?? "";
    const amount = parseAmount(cols[iAmount] ?? "");
    const sku = cols[iSku]?.trim() ?? "";
    const qty = parseInt(cols[iQuantity] ?? "", 10) || 0;
    const orderId = cols[iOrderId]?.trim() ?? "";

    // SKU-Level tracking
    if (sku) {
      const entry = skuMap.get(sku) ?? { sku, gross: 0, fees: 0, refunds: 0, ads: 0, net: 0, units: 0, returns: 0 };
      entry.net += amount;
      skuMap.set(sku, entry);
    }

    if (transType === "Order" || transType === "order") {
      if (orderId) orderIds.add(orderId);
      if (amountType === "ItemPrice" || amountType === "Promotion") {
        if (amountType === "Promotion") {
          promotionDiscounts += Math.abs(amount);
          if (sku) skuMap.get(sku)!.fees += Math.abs(amount);
        } else {
          grossSales += amount;
          if (sku) {
            skuMap.get(sku)!.gross += amount;
            skuMap.get(sku)!.units += qty;
          }
          unitsSold += qty;
        }
      } else if (amountType === "ItemFees" || amountType === "FBA Fees") {
        if (MARKETPLACE_FEE_TYPES.has(amountDesc)) {
          marketplaceFees += Math.abs(amount);
        } else if (FULFILLMENT_FEE_TYPES.has(amountDesc)) {
          fulfillmentFees += Math.abs(amount);
        } else {
          otherFees += Math.abs(amount);
          otherFeesBreakdown[amountDesc] = (otherFeesBreakdown[amountDesc] ?? 0) + Math.abs(amount);
        }
        if (sku) skuMap.get(sku)!.fees += Math.abs(amount);
      } else if (amountType === "ShippingPrice" || amountType === "ShippingTax") {
        grossSales += amount;
        if (sku) skuMap.get(sku)!.gross += amount;
      } else if (SHIPPING_FEE_TYPES.has(amountDesc)) {
        shippingFees += Math.abs(amount);
      }
    } else if (transType === "Refund" || transType === "refund") {
      if (orderId) returnOrderIds.add(orderId);
      if (amountType === "ItemPrice") {
        refundsAmount += Math.abs(amount);
        if (sku) {
          skuMap.get(sku)!.refunds += Math.abs(amount);
          skuMap.get(sku)!.returns += qty;
        }
      } else if (amountType === "ItemFees") {
        refundsFeesReturned += Math.abs(amount);
      }
    } else if (
      transType === "other-transaction" ||
      ADVERTISING_TYPES.has(amountDesc) ||
      amountType === "CostOfAdvertising"
    ) {
      if (ADVERTISING_TYPES.has(amountDesc) || amountType === "CostOfAdvertising") {
        advertisingFees += Math.abs(amount);
        if (sku) skuMap.get(sku)!.ads += Math.abs(amount);
      } else if (amountDesc === "CurrentReserveAmount" || amountDesc === "PreviousReserveAmount") {
        reserveAmount += amount;
      } else {
        otherFees += Math.abs(amount);
        otherFeesBreakdown[amountDesc || transType] =
          (otherFeesBreakdown[amountDesc || transType] ?? 0) + Math.abs(amount);
      }
    }
  }

  const netPayout =
    grossSales -
    refundsAmount +
    refundsFeesReturned -
    marketplaceFees -
    fulfillmentFees -
    advertisingFees -
    shippingFees -
    promotionDiscounts -
    otherFees +
    reserveAmount;

  const productBreakdown = Array.from(skuMap.values())
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 100);

  return {
    settlementId,
    periodFrom,
    periodTo,
    grossSales: round2(grossSales),
    refundsAmount: round2(refundsAmount),
    refundsFeesReturned: round2(refundsFeesReturned),
    marketplaceFees: round2(marketplaceFees),
    fulfillmentFees: round2(fulfillmentFees),
    advertisingFees: round2(advertisingFees),
    shippingFees: round2(shippingFees),
    promotionDiscounts: round2(promotionDiscounts),
    otherFees: round2(otherFees),
    otherFeesBreakdown,
    reserveAmount: round2(reserveAmount),
    netPayout: round2(netPayout),
    ordersCount: orderIds.size,
    returnsCount: returnOrderIds.size,
    unitsSold,
    productBreakdown,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
