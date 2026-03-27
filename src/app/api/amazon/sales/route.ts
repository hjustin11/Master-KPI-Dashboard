import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";

type AmazonOrder = {
  AmazonOrderId?: string;
  PurchaseDate?: string;
  OrderTotal?: {
    Amount?: string;
    CurrencyCode?: string;
  };
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
};

type SalesPoint = {
  date: string;
  orders: number;
  amount: number;
  units: number;
};

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

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

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isoDate(value: string) {
  return value.slice(0, 10);
}

function percentEncodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) =>
    `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function canonicalQuery(query: Record<string, string>) {
  const pairs = Object.entries(query).filter(([, v]) => v !== "");
  pairs.sort(([a], [b]) => a.localeCompare(b));
  return pairs
    .map(([k, v]) => `${percentEncodeRfc3986(k)}=${percentEncodeRfc3986(v)}`)
    .join("&");
}

async function getSupabaseSecret(key: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integration_secrets")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return "";
  return typeof data?.value === "string" ? data.value.trim() : "";
}

async function getConfig() {
  const refreshToken = env("AMAZON_SP_API_REFRESH_TOKEN") || (await getSupabaseSecret("AMAZON_SP_API_REFRESH_TOKEN"));
  const lwaClientId = env("AMAZON_SP_API_CLIENT_ID") || (await getSupabaseSecret("AMAZON_SP_API_CLIENT_ID"));
  const lwaClientSecret =
    env("AMAZON_SP_API_CLIENT_SECRET") || (await getSupabaseSecret("AMAZON_SP_API_CLIENT_SECRET"));
  const awsAccessKeyId = env("AMAZON_AWS_ACCESS_KEY_ID") || (await getSupabaseSecret("AMAZON_AWS_ACCESS_KEY_ID"));
  const awsSecretAccessKey =
    env("AMAZON_AWS_SECRET_ACCESS_KEY") || (await getSupabaseSecret("AMAZON_AWS_SECRET_ACCESS_KEY"));
  const awsSessionToken = env("AMAZON_AWS_SESSION_TOKEN") || (await getSupabaseSecret("AMAZON_AWS_SESSION_TOKEN"));
  const region = env("AMAZON_SP_API_REGION") || (await getSupabaseSecret("AMAZON_SP_API_REGION")) || "eu-west-1";
  const endpoint =
    normalizeHost(
      env("AMAZON_SP_API_ENDPOINT") ||
        (await getSupabaseSecret("AMAZON_SP_API_ENDPOINT")) ||
        "sellingpartnerapi-eu.amazon.com"
    );
  const marketplaceIdsRaw =
    env("AMAZON_SP_API_MARKETPLACE_IDS") ||
    env("AMAZON_SP_API_MARKETPLACE_ID") ||
    (await getSupabaseSecret("AMAZON_SP_API_MARKETPLACE_IDS")) ||
    (await getSupabaseSecret("AMAZON_SP_API_MARKETPLACE_ID"));
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

  canonicalHeadersList.sort(([a], [b]) => a.localeCompare(b));
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
      return NextResponse.json(
        {
          error: "Amazon SP-API ist nicht vollständig konfiguriert.",
          missing,
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get("days") ?? "7") || 7, 1), 60);
    const createdAfterIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const lwaAccessToken = await getLwaAccessToken({
      refreshToken: config.refreshToken,
      lwaClientId: config.lwaClientId,
      lwaClientSecret: config.lwaClientSecret,
    });

    const allOrders: AmazonOrder[] = [];
    let nextToken = "";
    let guard = 0;

    while (guard < 20) {
      const query: Record<string, string> = nextToken
        ? { NextToken: nextToken }
        : {
            MarketplaceIds: config.marketplaceIds.join(","),
            CreatedAfter: createdAfterIso,
            MaxResultsPerPage: "100",
          };

      const ordersResult = await spApiGet({
        endpoint: config.endpoint,
        region: config.region,
        path: "/orders/v0/orders",
        query,
        awsAccessKeyId: config.awsAccessKeyId,
        awsSecretAccessKey: config.awsSecretAccessKey,
        awsSessionToken: config.awsSessionToken,
        lwaAccessToken,
      });

      if (!ordersResult.res.ok || !ordersResult.json) {
        return NextResponse.json(
          {
            error: "Amazon Orders konnten nicht geladen werden.",
            status: ordersResult.res.status,
            preview: (ordersResult.text ?? "").slice(0, 320),
          },
          { status: 502 }
        );
      }

      const payload = ordersResult.json as {
        payload?: { Orders?: AmazonOrder[]; NextToken?: string };
      };
      const orders = payload?.payload?.Orders ?? [];
      allOrders.push(...orders);
      nextToken = payload?.payload?.NextToken ?? "";
      if (!nextToken) break;
      guard += 1;
    }

    const pointsMap = new Map<string, SalesPoint>();
    let totalSalesAmount = 0;
    let totalUnits = 0;
    let currency = "EUR";

    for (const order of allOrders) {
      const purchaseDate = typeof order.PurchaseDate === "string" ? order.PurchaseDate : "";
      if (!purchaseDate) continue;
      const date = isoDate(purchaseDate);
      const amount = toNumber(order.OrderTotal?.Amount ?? 0);
      const units =
        toNumber(order.NumberOfItemsShipped ?? 0) + toNumber(order.NumberOfItemsUnshipped ?? 0);
      const code = order.OrderTotal?.CurrencyCode;
      if (typeof code === "string" && code) currency = code;

      totalSalesAmount += amount;
      totalUnits += units;

      const prev = pointsMap.get(date) ?? { date, orders: 0, amount: 0, units: 0 };
      prev.orders += 1;
      prev.amount += amount;
      prev.units += units;
      pointsMap.set(date, prev);
    }

    const points = Array.from(pointsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      meta: {
        days,
        createdAfter: createdAfterIso,
        marketplaces: config.marketplaceIds,
        region: config.region,
      },
      summary: {
        orderCount: allOrders.length,
        salesAmount: Number(totalSalesAmount.toFixed(2)),
        units: totalUnits,
        currency,
      },
      points,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

