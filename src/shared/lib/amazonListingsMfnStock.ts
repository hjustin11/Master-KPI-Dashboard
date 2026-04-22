import crypto from "node:crypto";
import {
  getAmazonProductsLwaToken,
  loadAmazonSpApiProductsConfig,
  resolveEffectiveAmazonSellerId,
  type AmazonSpApiProductsConfig,
} from "@/shared/lib/amazonProductsSpApiCatalog";
import { getDefaultAmazonMarketplaceId } from "@/shared/config/amazonMarketplaces";

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

function normalizeHost(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function asciiCompare(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function hmac(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function hashHex(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function percentEncodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) =>
    `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function canonicalQuery(query: Record<string, string>) {
  const pairs = Object.entries(query).filter(([, v]) => v !== "");
  pairs.sort(([a], [b]) => asciiCompare(a, b));
  return pairs
    .map(([k, v]) => `${percentEncodeRfc3986(k)}=${percentEncodeRfc3986(v)}`)
    .join("&");
}

async function spApiGet(args: {
  endpoint: string;
  region: string;
  path: string;
  query: Record<string, string>;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  lwaAccessToken: string;
}) {
  const method = "GET";
  const service = "execute-api";
  const host = args.endpoint;
  const canonicalUri = args.path;
  const queryString = canonicalQuery(args.query);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeadersList: Array<[string, string]> = [
    ["host", host],
    ["x-amz-access-token", args.lwaAccessToken],
    ["x-amz-date", amzDate],
  ];
  if (args.awsSessionToken) canonicalHeadersList.push(["x-amz-security-token", args.awsSessionToken]);
  canonicalHeadersList.sort(([a], [b]) => asciiCompare(a, b));
  const canonicalHeaders = canonicalHeadersList.map(([k, v]) => `${k}:${v.trim()}\n`).join("");
  const signedHeaders = canonicalHeadersList.map(([k]) => k).join(";");
  const payloadHash = hashHex("");
  const canonicalRequest = [method, canonicalUri, queryString, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${args.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashHex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${args.awsSecretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, args.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmacHex(kSigning, stringToSign);
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${args.awsAccessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");
  const url = new URL(`https://${host}${canonicalUri}`);
  for (const [k, v] of Object.entries(args.query)) {
    if (v !== "") url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {
    host,
    "x-amz-date": amzDate,
    "x-amz-access-token": args.lwaAccessToken,
    Authorization: authorization,
    Accept: "application/json",
  };
  if (args.awsSessionToken) headers["x-amz-security-token"] = args.awsSessionToken;
  const res = await fetch(url.toString(), { method, headers, cache: "no-store" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

const CONTENT_TYPE = "application/json; charset=utf-8";

async function spApiPatch(args: {
  endpoint: string;
  region: string;
  path: string;
  query: Record<string, string>;
  body: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  lwaAccessToken: string;
}) {
  const method = "PATCH";
  const service = "execute-api";
  const host = args.endpoint;
  const canonicalUri = args.path;
  const queryString = canonicalQuery(args.query);
  const payloadHash = hashHex(args.body);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeadersList: Array<[string, string]> = [
    ["content-type", CONTENT_TYPE],
    ["host", host],
    ["x-amz-access-token", args.lwaAccessToken],
    ["x-amz-date", amzDate],
  ];
  if (args.awsSessionToken) canonicalHeadersList.push(["x-amz-security-token", args.awsSessionToken]);
  canonicalHeadersList.sort(([a], [b]) => asciiCompare(a, b));
  const canonicalHeaders = canonicalHeadersList.map(([k, v]) => `${k}:${v.trim()}\n`).join("");
  const signedHeaders = canonicalHeadersList.map(([k]) => k).join(";");
  const canonicalRequest = [method, canonicalUri, queryString, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${args.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashHex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${args.awsSecretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, args.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmacHex(kSigning, stringToSign);
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${args.awsAccessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");
  const url = new URL(`https://${host}${canonicalUri}`);
  for (const [k, v] of Object.entries(args.query)) {
    if (v !== "") url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {
    host,
    "content-type": CONTENT_TYPE,
    "x-amz-date": amzDate,
    "x-amz-access-token": args.lwaAccessToken,
    Authorization: authorization,
    Accept: "application/json",
  };
  if (args.awsSessionToken) headers["x-amz-security-token"] = args.awsSessionToken;
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: args.body,
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

function firstAttributeText(input: unknown): string {
  if (typeof input === "string") return input.trim();
  if (Array.isArray(input)) {
    for (const item of input) {
      const t = firstAttributeText(item);
      if (t) return t;
    }
    return "";
  }
  if (input && typeof input === "object") {
    const r = input as Record<string, unknown>;
    if (typeof r.value === "string" && r.value.trim()) return r.value.trim();
    for (const v of Object.values(r)) {
      const t = firstAttributeText(v);
      if (t) return t;
    }
  }
  return "";
}

function extractProductTypeFromListingPayload(payload: unknown): string {
  const obj = (payload ?? {}) as Record<string, unknown>;
  const summaries = Array.isArray(obj.summaries) ? obj.summaries : [];
  const summary = (summaries[0] ?? {}) as Record<string, unknown>;
  const fromSummary =
    (typeof summary.productType === "string" && summary.productType.trim()) ||
    (typeof summary.itemTypeName === "string" && summary.itemTypeName.trim()) ||
    "";
  if (fromSummary) return fromSummary;
  const attributes = (obj.attributes ?? {}) as Record<string, unknown>;
  return (
    firstAttributeText(attributes.product_type) ||
    firstAttributeText(attributes.item_type_name) ||
    ""
  );
}

function collectFulfillmentChannelCodes(payload: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (typeof v === "object") {
      const r = v as Record<string, unknown>;
      const code = String(r.fulfillment_channel_code ?? r.fulfillmentChannelCode ?? "").trim();
      if (code) out.push(code);
      for (const val of Object.values(r)) walk(val);
    }
  };
  walk(payload);
  return [...new Set(out)];
}

function formatSpApiError(json: unknown, status: number, text: string): string {
  if (json && typeof json === "object") {
    const errs = (json as Record<string, unknown>).errors;
    if (Array.isArray(errs) && errs.length > 0) {
      const first = errs[0] as Record<string, unknown>;
      const msg = String(first.message ?? first.code ?? "").trim();
      if (msg) return msg;
    }
  }
  const preview = text.replace(/\s+/g, " ").trim().slice(0, 200);
  return preview || `HTTP ${status}`;
}

export type AmazonMfnStockSyncResult = {
  success: Array<{ sku: string }>;
  failures: Array<{ sku: string; reason: string }>;
};

/**
 * Setzt MFN-Bestand (Kanal DEFAULT) und/oder Preis per Listings Items API patchListingsItem.
 * FBA-only Listings werden für Bestand nicht verändert; Preis-Updates laufen auch bei FBA.
 * `stockQty` und `priceEur` sind optional — mindestens eines muss gesetzt sein.
 */
export async function syncAmazonMfnStockQuantities(
  updates: Array<{ sku: string; stockQty?: number; priceEur?: number }>
): Promise<AmazonMfnStockSyncResult> {
  const success: AmazonMfnStockSyncResult["success"] = [];
  const failures: AmazonMfnStockSyncResult["failures"] = [];

  if (updates.length === 0) return { success, failures };

  let config: AmazonSpApiProductsConfig;
  try {
    config = await loadAmazonSpApiProductsConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Amazon-Konfiguration konnte nicht geladen werden.";
    return {
      success: [],
      failures: updates.map((u) => ({ sku: u.sku, reason: msg })),
    };
  }

  if (
    !config.refreshToken ||
    !config.lwaClientId ||
    !config.lwaClientSecret ||
    !config.awsAccessKeyId ||
    !config.awsSecretAccessKey ||
    config.marketplaceIds.length === 0
  ) {
    return {
      success: [],
      failures: updates.map((u) => ({
        sku: u.sku,
        reason: "Amazon SP-API nicht vollständig konfiguriert (LWA/AWS/Marketplace).",
      })),
    };
  }

  let lwaAccessToken: string;
  try {
    lwaAccessToken = await getAmazonProductsLwaToken(config);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "LWA-Token fehlgeschlagen.";
    return { success: [], failures: updates.map((u) => ({ sku: u.sku, reason: msg })) };
  }

  let sellerId = config.sellerId.trim();
  if (!sellerId) {
    sellerId = (await resolveEffectiveAmazonSellerId(config, lwaAccessToken)) ?? "";
  }
  if (!sellerId) {
    return {
      success: [],
      failures: updates.map((u) => ({
        sku: u.sku,
        reason: "Amazon Seller-ID fehlt (AMAZON_SP_API_SELLER_ID).",
      })),
    };
  }

  const marketplaceId = getDefaultAmazonMarketplaceId(config.marketplaceIds);
  const baseArgs = {
    endpoint: normalizeHost(config.endpoint),
    region: config.region,
    awsAccessKeyId: config.awsAccessKeyId,
    awsSecretAccessKey: config.awsSecretAccessKey,
    awsSessionToken: config.awsSessionToken || env("AMAZON_AWS_SESSION_TOKEN") || undefined,
    lwaAccessToken,
  };

  for (const u of updates) {
    const sku = u.sku.trim();
    if (!sku) {
      failures.push({ sku: u.sku, reason: "Leere SKU." });
      continue;
    }
    const wantsStock = typeof u.stockQty === "number" && Number.isFinite(u.stockQty);
    const wantsPrice = typeof u.priceEur === "number" && Number.isFinite(u.priceEur) && u.priceEur > 0;
    if (!wantsStock && !wantsPrice) {
      failures.push({ sku, reason: "Weder stockQty noch priceEur vorhanden." });
      continue;
    }
    try {
      const getRes = await spApiGet({
        ...baseArgs,
        path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`,
        query: {
          marketplaceIds: marketplaceId,
          includedData: "summaries,attributes,fulfillmentAvailability",
        },
      });
      if (!getRes.res.ok) {
        failures.push({
          sku,
          reason: `Listings-Read: ${formatSpApiError(getRes.json, getRes.res.status, getRes.text)}`,
        });
        continue;
      }

      if (wantsStock) {
        const channels = collectFulfillmentChannelCodes(getRes.json);
        const hasDefault = channels.some((c) => c.toUpperCase() === "DEFAULT");
        const onlyAmazonChannels =
          channels.length > 0 && channels.every((c) => /^AMAZON/i.test(c));
        if (!hasDefault && onlyAmazonChannels) {
          failures.push({
            sku,
            reason:
              "Nur FBA-Kanäle gefunden (kein MFN DEFAULT). Bestandsänderung für Seller-Fulfilled hier nicht anwendbar.",
          });
          continue;
        }
      }

      const productType = extractProductTypeFromListingPayload(getRes.json);
      if (!productType) {
        failures.push({
          sku,
          reason: "productType konnte aus der Listung nicht gelesen werden (PATCH nicht möglich).",
        });
        continue;
      }

      const patches: Array<Record<string, unknown>> = [];
      if (wantsStock) {
        patches.push({
          op: "merge",
          path: "/attributes/fulfillment_availability",
          value: [
            {
              fulfillment_channel_code: "DEFAULT",
              quantity: Math.max(0, Math.trunc(u.stockQty!)),
            },
          ],
        });
      }
      if (wantsPrice) {
        patches.push({
          op: "replace",
          path: "/attributes/purchasable_offer",
          value: [
            {
              marketplace_id: marketplaceId,
              audience: "ALL",
              currency: "EUR",
              our_price: [
                {
                  schedule: [{ value_with_tax: Number(u.priceEur!.toFixed(2)) }],
                },
              ],
            },
          ],
        });
      }
      const patchBody = JSON.stringify({ productType, patches });

      const patchRes = await spApiPatch({
        ...baseArgs,
        path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`,
        query: { marketplaceIds: marketplaceId },
        body: patchBody,
      });

      if (!patchRes.res.ok) {
        failures.push({
          sku,
          reason: `Listings-PATCH: ${formatSpApiError(patchRes.json, patchRes.res.status, patchRes.text)}`,
        });
        continue;
      }
      success.push({ sku });
    } catch (e) {
      failures.push({
        sku,
        reason: e instanceof Error ? e.message : "Amazon Bestand-Update fehlgeschlagen.",
      });
    }
  }

  return { success, failures };
}
