import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { amazonSpApiIncompleteJson } from "@/shared/lib/amazonSpApiConfigError";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import { amazonSpApiGetWithQuotaRetry } from "@/shared/lib/amazonSpApiQuotaRetry";
import { getDefaultAmazonMarketplaceId } from "@/shared/config/amazonMarketplaces";

export const maxDuration = 60;

const SOLICITATION_BODY = "{}";
const CONTENT_TYPE = "application/json; charset=utf-8";

function normalizeHost(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function hashHex(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function percentEncodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) =>
    `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function asciiCompare(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function canonicalQuery(query: Record<string, string>) {
  const pairs = Object.entries(query).filter(([, v]) => v !== "");
  pairs.sort(([a], [b]) => asciiCompare(a, b));
  return pairs
    .map(([k, v]) => `${percentEncodeRfc3986(k)}=${percentEncodeRfc3986(v)}`)
    .join("&");
}

function isValidAmazonOrderId(id: string): boolean {
  if (!id || id.length < 10 || id.length > 64) return false;
  return /^[A-Za-z0-9-]+$/.test(id);
}

function amazonApiErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const errors = (json as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (first && typeof first === "object" && "message" in first) {
    const msg = (first as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return null;
}

async function getConfig() {
  const refreshToken = await getIntegrationSecretValue("AMAZON_SP_API_REFRESH_TOKEN");
  const lwaClientId = await getIntegrationSecretValue("AMAZON_SP_API_CLIENT_ID");
  const lwaClientSecret = await getIntegrationSecretValue("AMAZON_SP_API_CLIENT_SECRET");
  const awsAccessKeyId = await getIntegrationSecretValue("AMAZON_AWS_ACCESS_KEY_ID");
  const awsSecretAccessKey = await getIntegrationSecretValue("AMAZON_AWS_SECRET_ACCESS_KEY");
  const awsSessionToken = await getIntegrationSecretValue("AMAZON_AWS_SESSION_TOKEN");
  const region = (await getIntegrationSecretValue("AMAZON_SP_API_REGION")) || "eu-west-1";
  const endpoint = normalizeHost(
    (await getIntegrationSecretValue("AMAZON_SP_API_ENDPOINT")) || "sellingpartnerapi-eu.amazon.com"
  );
  const marketplaceIdsRaw =
    (await getIntegrationSecretValue("AMAZON_SP_API_MARKETPLACE_IDS")) ||
    (await getIntegrationSecretValue("AMAZON_SP_API_MARKETPLACE_ID"));
  const marketplaceIds = marketplaceIdsRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const max429Retries = Math.min(
    30,
    Math.max(1, Number(await getIntegrationSecretValue("AMAZON_SP_API_MAX_429_RETRIES")) || 10)
  );

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
    max429Retries,
  };
}

async function getLwaAccessToken(args: {
  refreshToken: string;
  lwaClientId: string;
  lwaClientSecret: string;
}) {
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

  const token = (json as { access_token?: string } | null)?.access_token;
  if (!res.ok || !token) {
    throw new Error(`LWA Token konnte nicht geladen werden (${res.status}).`);
  }
  return token;
}

async function spApiPost(args: {
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
  const method = "POST";
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
  if (args.awsSessionToken) {
    canonicalHeadersList.push(["x-amz-security-token", args.awsSessionToken]);
  }
  canonicalHeadersList.sort(([a], [b]) => asciiCompare(a, b));

  const canonicalHeaders = canonicalHeadersList.map(([k, v]) => `${k}:${v.trim()}\n`).join("");
  const signedHeaders = canonicalHeadersList.map(([k]) => k).join(";");

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
    "content-type": CONTENT_TYPE,
    "x-amz-date": amzDate,
    "x-amz-access-token": args.lwaAccessToken,
    Authorization: authorization,
    Accept: "application/json",
  };
  if (args.awsSessionToken) {
    headers["x-amz-security-token"] = args.awsSessionToken;
  }

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

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
    }

    let bodyJson: unknown;
    try {
      bodyJson = await request.json();
    } catch {
      return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
    }

    const orderId =
      typeof bodyJson === "object" && bodyJson !== null && "orderId" in bodyJson
        ? String((bodyJson as { orderId?: unknown }).orderId ?? "").trim()
        : "";

    if (!isValidAmazonOrderId(orderId)) {
      return NextResponse.json({ error: "Ungültige Bestellnummer." }, { status: 400 });
    }

    const config = await getConfig();
    const missing = {
      AMAZON_SP_API_REFRESH_TOKEN: !config.refreshToken,
      AMAZON_SP_API_CLIENT_ID: !config.lwaClientId,
      AMAZON_SP_API_CLIENT_SECRET: !config.lwaClientSecret,
      AMAZON_AWS_ACCESS_KEY_ID: !config.awsAccessKeyId,
      AMAZON_AWS_SECRET_ACCESS_KEY: !config.awsSecretAccessKey,
      AMAZON_SP_API_MARKETPLACE_ID: config.marketplaceIds.length === 0,
    };
    if (Object.values(missing).some(Boolean)) {
      return amazonSpApiIncompleteJson(missing);
    }

    const marketplaceId = getDefaultAmazonMarketplaceId(config.marketplaceIds);
    const path = `/solicitations/v1/orders/${encodeURIComponent(orderId)}/solicitations/productReviewAndSellerFeedback`;

    const lwaAccessToken = await getLwaAccessToken({
      refreshToken: config.refreshToken,
      lwaClientId: config.lwaClientId,
      lwaClientSecret: config.lwaClientSecret,
    });

    const result = await amazonSpApiGetWithQuotaRetry(
      () =>
        spApiPost({
          endpoint: config.endpoint,
          region: config.region,
          path,
          query: { marketplaceIds: marketplaceId },
          body: SOLICITATION_BODY,
          awsAccessKeyId: config.awsAccessKeyId,
          awsSecretAccessKey: config.awsSecretAccessKey,
          awsSessionToken: config.awsSessionToken,
          lwaAccessToken,
        }),
      { max429Retries: config.max429Retries }
    );

    if (result.res.ok) {
      return NextResponse.json({ ok: true });
    }

    const apiMsg = amazonApiErrorMessage(result.json);
    const fallback =
      apiMsg ||
      (result.text ? String(result.text).slice(0, 400) : "") ||
      `HTTP ${result.res.status}`;

    return NextResponse.json(
      { error: fallback, status: result.res.status },
      { status: result.res.status >= 400 && result.res.status < 600 ? result.res.status : 502 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
