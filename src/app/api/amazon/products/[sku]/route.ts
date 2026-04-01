import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { isOwnerFromSources } from "@/shared/lib/roles";
import {
  draftValuesFromSource,
  emptyDraftValues,
  normalizeDraftValues,
  normalizeSourceSnapshot,
  sourceSnapshotFromRow,
} from "@/shared/lib/amazonProductDraft";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import type { AmazonProductSourceSnapshot } from "@/shared/lib/amazonProductDraft";

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
      .flatMap((candidate) => extractStringsDeep(candidate))
      .filter((line) => line.length > 2)
      .slice(0, 12)
  );

  const descriptionCandidates = [
    attributes.product_description,
    attributes.description,
    attributes.generic_keyword,
  ];
  const description = dedupe(descriptionCandidates.flatMap((candidate) => extractStringsDeep(candidate))).join("\n\n");

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
    extractStringsDeep(attributes.item_name)[0] ||
    source.title;

  return {
    ...source,
    title: titleFromPayload || source.title,
    bulletPoints: bullets.length > 0 ? bullets : source.bulletPoints,
    description: description || source.description,
    images: images.length > 0 ? images : source.images,
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
      const sellerId = ((listPayload as { sellerId?: string }).sellerId ?? "").trim();
      if (sellerId) {
        const detailRes = await spApiGet({
          endpoint: config.endpoint,
          region: config.region,
          path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`,
          query: {
            marketplaceIds: config.marketplaceIds[0] ?? "",
            includedData: "summaries,attributes",
          },
          awsAccessKeyId: config.awsAccessKeyId,
          awsSecretAccessKey: config.awsSecretAccessKey,
          awsSessionToken: config.awsSessionToken,
          lwaAccessToken,
        });
        if (detailRes.res.ok && detailRes.json) {
          enrichedSource = extractDetailFromListingsPayload(detailRes.json, source);
        }
      }
    }
  } catch {
    // detail fallback bleibt Listenwert
  }

  const canManageDrafts = await isOwnerUser(currentUser);
  if (!canManageDrafts) {
    return NextResponse.json({
      sku,
      sourceSnapshot: enrichedSource,
      draftValues: draftValuesFromSource(enrichedSource),
      draft: null,
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
  return NextResponse.json({
    sku,
    sourceSnapshot: draft?.source_snapshot ?? enrichedSource,
    draftValues: draft?.draft_values ?? draftValuesFromSource(enrichedSource) ?? emptyDraftValues(),
    draft,
  });
}
