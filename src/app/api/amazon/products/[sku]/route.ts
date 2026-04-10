import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { isOwnerFromSources } from "@/shared/lib/roles";
import {
  draftValuesFromSource,
  emptyDraftValues,
  mergeAmazonDraftValuesWithFresh,
  normalizeDraftValues,
  normalizeSourceSnapshot,
  sanitizeAmazonBulletPoints,
  sanitizeAmazonDescription,
  sourceSnapshotFromRow,
} from "@/shared/lib/amazonProductDraft";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import type { AmazonProductSourceSnapshot } from "@/shared/lib/amazonProductDraft";
import {
  resolveEffectiveAmazonSellerId,
  type AmazonSpApiProductsConfig,
} from "@/shared/lib/amazonProductsSpApiCatalog";
import { isLikelyAmazonShippingUuid } from "@/shared/lib/amazonMeasureDisplay";

async function getCurrentUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { user, supabase };
}

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

function collectMissingAmazonSecretKeys(): string[] {
  const m: string[] = [];
  if (!env("AMAZON_SP_API_REFRESH_TOKEN")) m.push("AMAZON_SP_API_REFRESH_TOKEN");
  if (!env("AMAZON_SP_API_CLIENT_ID")) m.push("AMAZON_SP_API_CLIENT_ID");
  if (!env("AMAZON_SP_API_CLIENT_SECRET")) m.push("AMAZON_SP_API_CLIENT_SECRET");
  if (!env("AMAZON_AWS_ACCESS_KEY_ID")) m.push("AMAZON_AWS_ACCESS_KEY_ID");
  if (!env("AMAZON_AWS_SECRET_ACCESS_KEY")) m.push("AMAZON_AWS_SECRET_ACCESS_KEY");
  if (!env("AMAZON_AWS_SESSION_TOKEN")) m.push("AMAZON_AWS_SESSION_TOKEN");
  if (!env("AMAZON_SP_API_REGION")) m.push("AMAZON_SP_API_REGION");
  if (!env("AMAZON_SP_API_ENDPOINT")) m.push("AMAZON_SP_API_ENDPOINT");
  if (!env("AMAZON_SP_API_MARKETPLACE_IDS") && !env("AMAZON_SP_API_MARKETPLACE_ID")) {
    m.push("AMAZON_SP_API_MARKETPLACE_IDS", "AMAZON_SP_API_MARKETPLACE_ID");
  }
  if (!env("AMAZON_SP_API_SELLER_ID")) m.push("AMAZON_SP_API_SELLER_ID");
  return [...new Set(m)];
}

async function loadSupabaseSecrets(keys: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return {};
  const admin = createAdminClient();
  const { data, error } = await admin.from("integration_secrets").select("key, value").in("key", unique);
  if (error || !data?.length) return {};
  const out: Record<string, string> = {};
  for (const row of data) {
    const k = row.key as string;
    const v = row.value;
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

async function getAmazonConfig() {
  const missingKeys = collectMissingAmazonSecretKeys();
  const secrets = missingKeys.length > 0 ? await loadSupabaseSecrets(missingKeys) : {};
  const s = (key: string) => secrets[key] ?? "";
  const refreshToken = env("AMAZON_SP_API_REFRESH_TOKEN") || s("AMAZON_SP_API_REFRESH_TOKEN");
  const lwaClientId = env("AMAZON_SP_API_CLIENT_ID") || s("AMAZON_SP_API_CLIENT_ID");
  const lwaClientSecret = env("AMAZON_SP_API_CLIENT_SECRET") || s("AMAZON_SP_API_CLIENT_SECRET");
  const awsAccessKeyId = env("AMAZON_AWS_ACCESS_KEY_ID") || s("AMAZON_AWS_ACCESS_KEY_ID");
  const awsSecretAccessKey = env("AMAZON_AWS_SECRET_ACCESS_KEY") || s("AMAZON_AWS_SECRET_ACCESS_KEY");
  const awsSessionToken = env("AMAZON_AWS_SESSION_TOKEN") || s("AMAZON_AWS_SESSION_TOKEN");
  const region = env("AMAZON_SP_API_REGION") || s("AMAZON_SP_API_REGION") || "eu-west-1";
  const endpoint = normalizeHost(
    env("AMAZON_SP_API_ENDPOINT") || s("AMAZON_SP_API_ENDPOINT") || "sellingpartnerapi-eu.amazon.com"
  );
  const marketplaceIdsRaw =
    env("AMAZON_SP_API_MARKETPLACE_IDS") ||
    env("AMAZON_SP_API_MARKETPLACE_ID") ||
    s("AMAZON_SP_API_MARKETPLACE_IDS") ||
    s("AMAZON_SP_API_MARKETPLACE_ID");
  const marketplaceIds = marketplaceIdsRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const sellerId = (env("AMAZON_SP_API_SELLER_ID") || s("AMAZON_SP_API_SELLER_ID")).trim();
  return {
    refreshToken,
    lwaClientId,
    lwaClientSecret,
    awsAccessKeyId,
    awsSecretAccessKey,
    awsSessionToken,
    region,
    endpoint,
    marketplaceIds,
    sellerId,
  };
}

let lwaAccessTokenCache: { token: string; expiresAtMs: number } | null = null;
async function getLwaAccessToken(args: {
  refreshToken: string;
  lwaClientId: string;
  lwaClientSecret: string;
}) {
  const now = Date.now();
  if (lwaAccessTokenCache && lwaAccessTokenCache.expiresAtMs - 90_000 > now) {
    return lwaAccessTokenCache.token;
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
    client_id: args.lwaClientId,
    client_secret: args.lwaClientSecret,
  });
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  const parsed = json as { access_token?: string; expires_in?: number } | null;
  const token = parsed?.access_token;
  if (!res.ok || !token) throw new Error(`LWA Token konnte nicht geladen werden (${res.status}).`);
  const expiresInSec =
    typeof parsed?.expires_in === "number" && Number.isFinite(parsed.expires_in) && parsed.expires_in > 60
      ? parsed.expires_in
      : 3600;
  lwaAccessTokenCache = { token, expiresAtMs: now + expiresInSec * 1000 };
  return token;
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
  const canonicalRequest = [
    method,
    canonicalUri,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${args.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");
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

function extractStringsDeep(input: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) out.push(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) walk(nested);
    }
  };
  walk(input);
  return out;
}

const AMAZON_ATTRIBUTE_META_KEYS = new Set([
  "language_tag",
  "language",
  "locale",
  "marketplace_id",
  "marketplaceid",
  "marketplace",
  "audience",
  "channel",
  "business_type",
  "contributor",
]);

function isNoiseToken(value: string) {
  const v = value.trim();
  if (!v) return true;
  if (/^[a-z]{2}_[A-Z]{2}$/.test(v)) return true;
  if (/^A[0-9A-Z]{9,14}$/.test(v)) return true;
  return false;
}

function collectAttributeTextValues(input: unknown, out: string[] = []): string[] {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed && !isNoiseToken(trimmed)) out.push(trimmed);
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectAttributeTextValues(item, out);
    return out;
  }
  if (!input || typeof input !== "object") return out;
  const record = input as Record<string, unknown>;
  if (typeof record.value === "string") {
    const value = record.value.trim();
    if (value && !isNoiseToken(value)) out.push(value);
  } else if (typeof record.value === "number" && Number.isFinite(record.value)) {
    const asText = String(record.value);
    if (!isNoiseToken(asText)) out.push(asText);
  }
  for (const [key, nested] of Object.entries(record)) {
    if (key === "value") continue;
    if (AMAZON_ATTRIBUTE_META_KEYS.has(key.toLowerCase())) continue;
    collectAttributeTextValues(nested, out);
  }
  return out;
}

function firstAttributeText(input: unknown): string {
  return dedupe(collectAttributeTextValues(input))[0] ?? "";
}

function parseNumberishValue(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const normalized = input.replace(/[^\d,.-]/g, "").replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const parsed = parseNumberishValue(item);
      if (parsed != null) return parsed;
    }
    return null;
  }
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  for (const key of ["amount", "value", "our_price", "standard_price", "list_price"]) {
    const parsed = parseNumberishValue(record[key]);
    if (parsed != null) return parsed;
  }
  for (const [key, nested] of Object.entries(record)) {
    if (AMAZON_ATTRIBUTE_META_KEYS.has(key.toLowerCase())) continue;
    const parsed = parseNumberishValue(nested);
    if (parsed != null) return parsed;
  }
  return null;
}

function parsePriceScheduleRow(row: unknown): number | null {
  if (row == null) return null;
  if (typeof row === "object") {
    const r = row as Record<string, unknown>;
    const direct = parseNumberishValue(r.value_with_tax ?? r.value);
    if (direct != null) return direct;
    const sched = r.schedule;
    if (Array.isArray(sched)) {
      for (const s of sched) {
        const n = parseNumberishValue(
          (s as Record<string, unknown>)?.value_with_tax ?? (s as Record<string, unknown>)?.value
        );
        if (n != null) return n;
      }
    }
  }
  return parseNumberishValue(row);
}

function extractOurPriceFromPurchasableOffer(input: unknown): number | null {
  if (input == null) return null;
  const offers = Array.isArray(input) ? input : [input];
  for (const offer of offers) {
    if (!offer || typeof offer !== "object") continue;
    const o = offer as Record<string, unknown>;
    for (const key of ["our_price", "discounted_price", "minimum_seller_allowed_price"]) {
      const block = o[key];
      if (block == null) continue;
      const rows = Array.isArray(block) ? block : [block];
      for (const row of rows) {
        const n = parsePriceScheduleRow(row);
        if (n != null) return n;
      }
    }
  }
  return null;
}

function extractListPriceFromPurchasableOffer(input: unknown): number | null {
  if (input == null) return null;
  const offers = Array.isArray(input) ? input : [input];
  for (const offer of offers) {
    if (!offer || typeof offer !== "object") continue;
    const o = offer as Record<string, unknown>;
    const lp = o.list_price;
    if (lp == null) continue;
    const rows = Array.isArray(lp) ? lp : [lp];
    for (const row of rows) {
      const n = parsePriceScheduleRow(row);
      if (n != null) return n;
    }
  }
  return null;
}

function formatDimensionPart(dim: unknown): string {
  if (dim == null) return "";
  if (typeof dim === "number" && Number.isFinite(dim)) return String(dim);
  if (typeof dim === "string" && dim.trim()) return dim.trim();
  if (typeof dim !== "object") return "";
  const d = dim as Record<string, unknown>;
  const v = d.value;
  const unit = typeof d.unit === "string" ? d.unit.trim() : "";
  if (typeof v === "number" && Number.isFinite(v)) return unit ? `${v} ${unit}` : String(v);
  if (typeof v === "string" && v.trim()) return unit ? `${v.trim()} ${unit}` : v.trim();
  return "";
}

function extractPackageDimensionsFromAttributes(attributes: Record<string, unknown>): {
  length: string;
  width: string;
  height: string;
  weight: string;
} {
  const keys = ["item_package_dimensions", "package_dimensions", "item_dimensions"] as const;
  for (const key of keys) {
    const raw = attributes[key];
    const blocks = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      const len = formatDimensionPart(b.length);
      const wid = formatDimensionPart(b.width);
      const hgt = formatDimensionPart(b.height);
      const wgt = formatDimensionPart(b.weight);
      if (len || wid || hgt || wgt) {
        return { length: len, width: wid, height: hgt, weight: wgt };
      }
    }
  }
  return { length: "", width: "", height: "", weight: "" };
}

function extractHandlingTimeFromAttributes(attributes: Record<string, unknown>): string {
  const fa = attributes.fulfillment_availability;
  if (Array.isArray(fa)) {
    for (const row of fa) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      for (const k of [
        "lead_time_to_ship_max_days",
        "lead_time_to_ship_maximum_days",
        "lead_time_to_ship_minimum_days",
        "lead_time_to_ship_min_max",
      ]) {
        const v = r[k];
        if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }
  }
  return "";
}

const SHIPPING_LABEL_KEYS = [
  "merchant_shipping_group_name",
  "name",
  "group_name",
  "display_name",
  "label",
  "title",
  "shipping_group_name",
] as const;

function collectShippingStringsFromObject(obj: Record<string, unknown>, bucket: string[]): void {
  for (const k of SHIPPING_LABEL_KEYS) {
    const val = obj[k];
    if (typeof val === "string" && val.trim()) bucket.push(val.trim());
  }
}

function walkShippingPayload(v: unknown, bucket: string[]): void {
  if (v == null) return;
  if (typeof v === "string") {
    if (v.trim()) bucket.push(v.trim());
    return;
  }
  if (Array.isArray(v)) {
    for (const item of v) walkShippingPayload(item, bucket);
    return;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    collectShippingStringsFromObject(o, bucket);
    for (const [k, val] of Object.entries(o)) {
      if ((SHIPPING_LABEL_KEYS as readonly string[]).includes(k)) continue;
      walkShippingPayload(val, bucket);
    }
  }
}

function bestShippingTemplateFromPayload(v: unknown): string {
  const bucket: string[] = [];
  walkShippingPayload(v, bucket);
  const human = bucket.find((s) => !isLikelyAmazonShippingUuid(s));
  if (human) return human;
  return bucket[0] ?? "";
}

function extractShippingTemplateFromAttributes(attributes: Record<string, unknown>): string {
  for (const key of [
    "merchant_shipping_group",
    "merchant_shipping_group_name",
    "merchant_shipping_group_key",
  ] as const) {
    const raw = attributes[key];
    const picked = bestShippingTemplateFromPayload(raw);
    if (picked) return picked;
  }
  return "";
}

function extractEan(attributes: Record<string, unknown>): string {
  const externalIdKeys = [
    "externally_assigned_product_identifier",
    "external_product_id",
    "ean",
    "ean_value",
    "gtin",
    "product_identifier",
  ];
  for (const key of externalIdKeys) {
    const raw = attributes[key];
    if (!raw) continue;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const rec = item as Record<string, unknown>;
        const typeText = firstAttributeText(rec.type ?? rec.type_name ?? rec.identifier_type).toLowerCase();
        const valueText =
          firstAttributeText(rec.value ?? rec.identifier ?? rec.id ?? rec.gtin) ||
          (typeof rec.value === "number" && Number.isFinite(rec.value) ? String(rec.value) : "");
        if (
          valueText &&
          (!typeText ||
            typeText.includes("ean") ||
            typeText.includes("gtin") ||
            typeText.includes("upc"))
        ) {
          return valueText.replace(/\s/g, "");
        }
      }
      continue;
    }
    const direct = firstAttributeText(raw);
    if (direct) return direct;
  }
  return "";
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function extractPricesFromTopLevelOffers(offers: unknown): { our: number | null; list: number | null } {
  let our: number | null = null;
  let list: number | null = null;
  const blocks = Array.isArray(offers) ? offers : offers != null ? [offers] : [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const o = block as Record<string, unknown>;
    const po = (o.purchasable_offer ?? o.purchasableOffer ?? o) as unknown;
    const oOur = extractOurPriceFromPurchasableOffer(po);
    const oList = extractListPriceFromPurchasableOffer(po);
    if (our == null && oOur != null) our = oOur;
    if (list == null && oList != null) list = oList;
  }
  return { our, list };
}

function extractQuantityFromFulfillmentBlocks(input: unknown): number | null {
  const blocks = Array.isArray(input) ? input : input != null ? [input] : [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const r = b as Record<string, unknown>;
    for (const key of [
      "quantity",
      "fulfillableQuantity",
      "fulfillable_quantity",
      "afn_fulfillable_quantity",
      "mfn_fulfillable_quantity",
    ]) {
      const n = parseNumberishValue(r[key]);
      if (n != null) return Math.trunc(n);
    }
  }
  return null;
}

function extractDetailFromListingsPayload(
  payload: unknown,
  source: AmazonProductSourceSnapshot
): AmazonProductSourceSnapshot {
  const obj = (payload ?? {}) as Record<string, unknown>;
  const summaries = Array.isArray(obj.summaries) ? obj.summaries : [];
  const summary = (summaries[0] ?? {}) as Record<string, unknown>;
  const attributes = (obj.attributes ?? {}) as Record<string, unknown>;

  const bulletCandidates = [
    attributes.bullet_point,
    attributes.bullet_points,
    attributes.key_product_features,
  ];
  const bullets = dedupe(
    bulletCandidates
      .flatMap((candidate) => collectAttributeTextValues(candidate))
      .filter((line) => line.length > 2)
      .slice(0, 12)
  );

  const descriptionCandidates = [attributes.product_description, attributes.description];
  const description = dedupe(descriptionCandidates.flatMap((candidate) => collectAttributeTextValues(candidate))).join(
    "\n\n"
  );

  const imageKeys = [
    "main_product_image_locator",
    "other_product_image_locator_1",
    "other_product_image_locator_2",
    "other_product_image_locator_3",
    "other_product_image_locator_4",
    "other_product_image_locator_5",
    "other_product_image_locator_6",
    "other_product_image_locator_7",
    "other_product_image_locator_8",
  ];
  const urlsFromAttributes = imageKeys.flatMap((key) => extractStringsDeep(attributes[key]));
  const urlsFromSummary = extractStringsDeep(summary).filter((value) => /^https?:\/\//i.test(value));
  const images = dedupe(
    [...urlsFromAttributes, ...urlsFromSummary].filter((value) => /^https?:\/\//i.test(value))
  ).slice(0, 20);

  const titleFromPayload =
    (typeof summary.itemName === "string" && summary.itemName.trim()) ||
    firstAttributeText(attributes.item_name) ||
    source.title;

  const productTypeFromPayload =
    firstAttributeText(attributes.product_type) ||
    firstAttributeText(attributes.item_type_name) ||
    source.productType;

  const brandFromPayload =
    firstAttributeText(attributes.brand) ||
    firstAttributeText(attributes.manufacturer) ||
    source.brand;

  const topOffers = extractPricesFromTopLevelOffers(obj.offers);
  const offerOur =
    extractOurPriceFromPurchasableOffer(attributes.purchasable_offer) ?? topOffers.our;
  const offerList =
    extractListPriceFromPurchasableOffer(attributes.purchasable_offer) ?? topOffers.list;
  const listPriceEur =
    offerOur ??
    parseNumberishValue(attributes.standard_price) ??
    parseNumberishValue(attributes.our_price) ??
    parseNumberishValue(attributes.list_price) ??
    source.listPriceEur;
  const uvpEur =
    offerList ??
    parseNumberishValue(attributes.msrp) ??
    parseNumberishValue(attributes.maximum_retail_price) ??
    parseNumberishValue(attributes.manufacturer_minimum_advertised_price) ??
    parseNumberishValue(attributes.listing_price) ??
    parseNumberishValue(attributes.list_price) ??
    source.uvpEur;
  const dims = extractPackageDimensionsFromAttributes(attributes);
  const handlingFromFa = extractHandlingTimeFromAttributes(attributes);
  const handlingTime =
    handlingFromFa || firstAttributeText(attributes.fulfillment_latency) || source.handlingTime;
  const shippingTemplate =
    extractShippingTemplateFromAttributes(attributes) ||
    firstAttributeText(attributes.merchant_shipping_group_name) ||
    source.shippingTemplate;
  const packageLength = dims.length || firstAttributeText(attributes.item_package_length) || source.packageLength;
  const packageWidth = dims.width || firstAttributeText(attributes.item_package_width) || source.packageWidth;
  const packageHeight = dims.height || firstAttributeText(attributes.item_package_height) || source.packageHeight;
  const packageWeight = dims.weight || firstAttributeText(attributes.item_package_weight) || source.packageWeight;
  const ean = extractEan(attributes);

  const qtyTop = extractQuantityFromFulfillmentBlocks(obj.fulfillmentAvailability);
  const qtyAttrs = extractQuantityFromFulfillmentBlocks(attributes.fulfillment_availability);
  const quantityResolved =
    qtyTop ?? qtyAttrs ?? (source.quantity != null && Number.isFinite(source.quantity) ? source.quantity : null);

  const conditionFromSummary =
    typeof summary.conditionType === "string" && summary.conditionType.trim()
      ? summary.conditionType.trim()
      : "";

  const mergedBullets = bullets.length > 0 ? bullets : source.bulletPoints;
  const mergedDesc = description || source.description;

  return {
    ...source,
    title: titleFromPayload || source.title,
    bulletPoints: sanitizeAmazonBulletPoints(mergedBullets),
    description: sanitizeAmazonDescription(mergedDesc),
    images: images.length > 0 ? images : source.images,
    productType: productTypeFromPayload || source.productType,
    brand: brandFromPayload || source.brand,
    conditionType: conditionFromSummary || source.conditionType,
    listPriceEur,
    uvpEur,
    handlingTime,
    shippingTemplate,
    quantity: quantityResolved,
    packageLength,
    packageWidth,
    packageHeight,
    packageWeight,
    externalProductId: ean || source.externalProductId,
    externalProductIdType: ean ? "ean" : source.externalProductIdType,
  };
}

async function isOwnerUser(args: {
  user: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
}) {
  const { user, supabase } = args;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return isOwnerFromSources({
    profileRole: profile?.role,
    appRole: user.app_metadata?.role,
    userRole: user.user_metadata?.role,
  });
}

export async function GET(request: Request, ctx: { params: Promise<{ sku: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const params = await ctx.params;
  const sku = decodeURIComponent(params.sku ?? "").trim();
  if (!sku) return NextResponse.json({ error: "sku ist erforderlich." }, { status: 400 });

  const { origin } = new URL(request.url);
  const listRes = await fetch(`${origin}/api/amazon/products?status=all&all=1`, {
    cache: "no-store",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
    },
  });
  const listPayload = (await listRes.json().catch(() => ({}))) as { items?: MarketplaceProductListRow[] };
  if (!listRes.ok) return NextResponse.json({ error: "Produktdetails konnten nicht geladen werden." }, { status: 500 });
  const row = (listPayload.items ?? []).find((item) => item.sku === sku);
  if (!row) return NextResponse.json({ error: "Produkt nicht gefunden." }, { status: 404 });

  const source = sourceSnapshotFromRow(row);
  let enrichedSource = source;
  let detailLoadHint: string | null = null;
  try {
    const config = await getAmazonConfig();
    if (
      config.refreshToken &&
      config.lwaClientId &&
      config.lwaClientSecret &&
      config.awsAccessKeyId &&
      config.awsSecretAccessKey &&
      config.marketplaceIds.length > 0
    ) {
      const lwaAccessToken = await getLwaAccessToken({
        refreshToken: config.refreshToken,
        lwaClientId: config.lwaClientId,
        lwaClientSecret: config.lwaClientSecret,
      });
      let sellerId = ((listPayload as { sellerId?: string }).sellerId ?? "").trim();
      if (!sellerId) sellerId = (config.sellerId ?? "").trim();
      if (!sellerId) {
        sellerId = await resolveEffectiveAmazonSellerId(config as AmazonSpApiProductsConfig, lwaAccessToken);
      }
      if (!sellerId) {
        detailLoadHint =
          "Seller-ID fehlt (weder Produktliste noch Umgebung). Amazon-Listings-Details können nicht geladen werden.";
      } else {
        const detailRes = await spApiGet({
          endpoint: config.endpoint,
          region: config.region,
          path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`,
          query: {
            marketplaceIds: config.marketplaceIds[0] ?? "",
            includedData: "summaries,attributes,offers,fulfillmentAvailability",
          },
          awsAccessKeyId: config.awsAccessKeyId,
          awsSecretAccessKey: config.awsSecretAccessKey,
          awsSessionToken: config.awsSessionToken,
          lwaAccessToken,
        });
        if (detailRes.res.ok && detailRes.json) {
          enrichedSource = extractDetailFromListingsPayload(detailRes.json, source);
        } else {
          const st = detailRes.res.status;
          detailLoadHint =
            st === 401 || st === 403
              ? "Listings-Details nicht geladen (Zugriff verweigert). Listings-API-Rechte in Seller Central prüfen."
              : `Listings-Details nicht geladen (HTTP ${st}). Es werden nur Tabellen-Daten angezeigt.`;
        }
      }
    }
  } catch {
    if (!detailLoadHint) detailLoadHint = "Listings-Details konnten nicht geladen werden.";
  }

  const freshDraft = draftValuesFromSource(enrichedSource);
  const canManageDrafts = await isOwnerUser(currentUser);
  if (!canManageDrafts) {
    return NextResponse.json({
      sku,
      sourceSnapshot: enrichedSource,
      draftValues: freshDraft,
      draft: null,
      ...(detailLoadHint ? { detailLoadHint } : {}),
    });
  }

  const admin = createAdminClient();
  const draftRes = await admin
    .from("amazon_product_drafts")
    .select("*")
    .eq("marketplace_slug", "amazon")
    .eq("mode", "edit_existing")
    .eq("sku", sku)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draftRes.error && draftRes.error.code !== "42P01") {
    return NextResponse.json({ error: draftRes.error.message }, { status: 500 });
  }
  const draft = draftRes.data
    ? {
        ...draftRes.data,
        source_snapshot: normalizeSourceSnapshot(draftRes.data.source_snapshot),
        draft_values: normalizeDraftValues(draftRes.data.draft_values),
      }
    : null;
  const draftValuesOut = draft
    ? mergeAmazonDraftValuesWithFresh(draft.draft_values, freshDraft)
    : freshDraft;
  return NextResponse.json({
    sku,
    sourceSnapshot: draft?.source_snapshot ?? enrichedSource,
    draftValues: draftValuesOut ?? emptyDraftValues(),
    draft,
    ...(detailLoadHint ? { detailLoadHint } : {}),
  });
}
