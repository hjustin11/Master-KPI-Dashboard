import crypto from "node:crypto";
import { NextResponse } from "next/server";

/** Vercel: Retries + Pagination können länger als 10s dauern. */
export const maxDuration = 60;
import { amazonSpApiIncompleteJson } from "@/shared/lib/amazonSpApiConfigError";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import {
  amazonSpApiGetWithQuotaRetry,
  amazonSpApiSleepMs,
} from "@/shared/lib/amazonSpApiQuotaRetry";

type AmazonOrder = {
  AmazonOrderId?: string;
  PurchaseDate?: string;
  LastUpdateDate?: string;
  OrderStatus?: string;
  FulfillmentChannel?: string;
  SalesChannel?: string;
  BuyerInfo?: {
    BuyerName?: string;
  };
  ShippingAddress?: {
    Name?: string;
  };
  OrderTotal?: {
    Amount?: string;
    CurrencyCode?: string;
  };
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
};

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

function parseDateInput(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDayIso(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayIso(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function clampToNow(date: Date) {
  const now = new Date();
  return date.getTime() > now.getTime() ? now : date;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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
  const ordersPageDelayMs = Math.max(
    0,
    Number(await getIntegrationSecretValue("AMAZON_SP_API_ORDERS_PAGE_DELAY_MS")) || 500
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
    ordersPageDelayMs,
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
  if (args.awsSessionToken) {
    canonicalHeadersList.push(["x-amz-security-token", args.awsSessionToken]);
  }
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
  if (args.awsSessionToken) {
    headers["x-amz-security-token"] = args.awsSessionToken;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
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

function mapFulfillment(channel: string) {
  if (channel === "AFN") return "FBA";
  if (channel === "MFN") return "FBM";
  return channel || "Unbekannt";
}

function mapStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "shipped") return "shipped";
  if (normalized === "unshipped" || normalized === "pending" || normalized === "partiallyshipped") {
    return "pending";
  }
  if (normalized === "canceled") return "cancelled";
  return normalized || "unknown";
}

export async function GET(request: Request) {
  try {
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

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const fromInput = parseDateInput(searchParams.get("from"));
    const toInput = parseDateInput(searchParams.get("to"));

    const rawFrom = fromInput ?? yesterday;
    const rawTo = toInput ?? now;
    const createdAfterIso = startOfDayIso(rawFrom);
    const createdBeforeIso = endOfDayIso(clampToNow(rawTo));

    const lwaAccessToken = await getLwaAccessToken({
      refreshToken: config.refreshToken,
      lwaClientId: config.lwaClientId,
      lwaClientSecret: config.lwaClientSecret,
    });

    const allOrders: AmazonOrder[] = [];
    let nextToken = "";
    let guard = 0;
    while (guard < 30) {
      if (nextToken && config.ordersPageDelayMs > 0) {
        await amazonSpApiSleepMs(config.ordersPageDelayMs);
      }
      const query: Record<string, string> = nextToken
        ? { NextToken: nextToken }
        : {
            MarketplaceIds: config.marketplaceIds.join(","),
            CreatedAfter: createdAfterIso,
            MaxResultsPerPage: "100",
          };

      const ordersResult = await amazonSpApiGetWithQuotaRetry(
        () =>
          spApiGet({
            endpoint: config.endpoint,
            region: config.region,
            path: "/orders/v0/orders",
            query,
            awsAccessKeyId: config.awsAccessKeyId,
            awsSecretAccessKey: config.awsSecretAccessKey,
            awsSessionToken: config.awsSessionToken,
            lwaAccessToken,
          }),
        { max429Retries: config.max429Retries }
      );
      if (!ordersResult.res.ok || !ordersResult.json) {
        return NextResponse.json(
          {
            error: "Amazon orders could not be loaded.",
            status: ordersResult.res.status,
            preview: (ordersResult.text ?? "").slice(0, 320),
          },
          { status: 502 }
        );
      }

      const payload = ordersResult.json as {
        payload?: { Orders?: AmazonOrder[]; NextToken?: string };
      };
      const chunk = payload?.payload?.Orders ?? [];
      allOrders.push(...chunk);
      nextToken = payload?.payload?.NextToken ?? "";
      if (!nextToken) break;
      guard += 1;
    }

    const createdBeforeTs = new Date(createdBeforeIso).getTime();
    const items = allOrders
      .filter((order) => {
        const ts = order.PurchaseDate ? new Date(order.PurchaseDate).getTime() : NaN;
        if (Number.isNaN(ts)) return false;
        return ts <= createdBeforeTs;
      })
      .map((order) => {
      const amount = numberValue(order.OrderTotal?.Amount);
      const currency = order.OrderTotal?.CurrencyCode || "EUR";
      const orderStatus = order.OrderStatus || "";
      const channel = order.FulfillmentChannel || "";
      const units =
        numberValue(order.NumberOfItemsShipped) + numberValue(order.NumberOfItemsUnshipped);
      const customerName =
        order.BuyerInfo?.BuyerName?.trim() ||
        order.ShippingAddress?.Name?.trim() ||
        "";
      return {
        orderId: order.AmazonOrderId || "",
        purchaseDate: order.PurchaseDate || "",
        lastUpdateDate: order.LastUpdateDate || "",
        amount,
        currency,
        fulfillment: mapFulfillment(channel),
        status: mapStatus(orderStatus),
        statusRaw: orderStatus,
        channelRaw: channel,
        units,
        customerName,
        salesChannel: order.SalesChannel || "",
      };
      });

    return NextResponse.json({
      meta: {
        from: createdAfterIso,
        to: createdBeforeIso,
        marketplaces: config.marketplaceIds,
      },
      totalCount: items.length,
      items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

