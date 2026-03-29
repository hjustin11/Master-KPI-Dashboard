import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { amazonSpApiIncompleteJson } from "@/shared/lib/amazonSpApiConfigError";
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

const DAY_MS = 24 * 60 * 60 * 1000;

type SalesOrderMetricRow = {
  /** z. B. bei Granularität „Day“: ISO-Intervall, Startdatum für die Zeitachse */
  interval?: string;
  orderCount?: number;
  unitCount?: number;
  orderItemCount?: number;
  totalSales?: { amount?: string; currencyCode?: string };
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

/** Aggregierte Verkaufskennzahlen direkt von der Sales API (Marktplatz-Metriken), nicht aus der Bestellliste. */
async function fetchSalesOrderMetricsTotal(args: {
  endpoint: string;
  region: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  lwaAccessToken: string;
  marketplaceIds: string[];
  startMs: number;
  endMs: number;
}): Promise<{ orderCount: number; salesAmount: number; units: number; currency: string } | null> {
  const { startMs, endMs } = args;
  const interval = `${new Date(startMs).toISOString()}--${new Date(endMs).toISOString()}`;
  const ordersResult = await spApiGet({
    endpoint: args.endpoint,
    region: args.region,
    path: "/sales/v1/orderMetrics",
    query: {
      marketplaceIds: args.marketplaceIds.join(","),
      interval,
      granularity: "Total",
    },
    awsAccessKeyId: args.awsAccessKeyId,
    awsSecretAccessKey: args.awsSecretAccessKey,
    awsSessionToken: args.awsSessionToken,
    lwaAccessToken: args.lwaAccessToken,
  });

  if (!ordersResult.res.ok || !ordersResult.json) {
    return null;
  }

  const payload = ordersResult.json as { payload?: SalesOrderMetricRow[] };
  const rows = payload?.payload ?? [];
  let orderCount = 0;
  let units = 0;
  let salesAmount = 0;
  let currency = "EUR";
  for (const row of rows) {
    orderCount += toNumber(row.orderCount ?? 0);
    units += toNumber(row.unitCount ?? 0);
    salesAmount += toNumber(row.totalSales?.amount ?? 0);
    const code = row.totalSales?.currencyCode;
    if (typeof code === "string" && code) currency = code;
  }
  return {
    orderCount,
    salesAmount: Number(salesAmount.toFixed(2)),
    units,
    currency,
  };
}

function intervalStartToYmd(interval: string | undefined): string | null {
  if (!interval || typeof interval !== "string") return null;
  const start = interval.split("--")[0]?.trim();
  if (!start) return null;
  return start.slice(0, 10);
}

/** Tageswerte für Diagramme (Sales API, granularity=Day). */
async function fetchSalesOrderMetricsDaySeries(args: {
  endpoint: string;
  region: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  lwaAccessToken: string;
  marketplaceIds: string[];
  startMs: number;
  endMs: number;
}): Promise<SalesPoint[] | null> {
  const tz =
    env("AMAZON_SALES_GRANULARITY_TIMEZONE") ||
    (await getSupabaseSecret("AMAZON_SALES_GRANULARITY_TIMEZONE")) ||
    "Europe/Berlin";
  const interval = `${new Date(args.startMs).toISOString()}--${new Date(args.endMs).toISOString()}`;
  const ordersResult = await spApiGet({
    endpoint: args.endpoint,
    region: args.region,
    path: "/sales/v1/orderMetrics",
    query: {
      marketplaceIds: args.marketplaceIds.join(","),
      interval,
      granularity: "Day",
      granularityTimeZone: tz,
    },
    awsAccessKeyId: args.awsAccessKeyId,
    awsSecretAccessKey: args.awsSecretAccessKey,
    awsSessionToken: args.awsSessionToken,
    lwaAccessToken: args.lwaAccessToken,
  });

  if (!ordersResult.res.ok || !ordersResult.json) {
    return null;
  }

  const payload = ordersResult.json as { payload?: SalesOrderMetricRow[] };
  const rows = payload?.payload ?? [];
  const out: SalesPoint[] = [];
  for (const row of rows) {
    const date = intervalStartToYmd(row.interval);
    if (!date) continue;
    out.push({
      date,
      orders: toNumber(row.orderCount ?? 0),
      amount: Number(toNumber(row.totalSales?.amount ?? 0).toFixed(2)),
      units: toNumber(row.unitCount ?? 0),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function ordersToDailyPoints(orders: AmazonOrder[]): SalesPoint[] {
  const pointsMap = new Map<string, SalesPoint>();
  for (const order of orders) {
    const purchaseDate = typeof order.PurchaseDate === "string" ? order.PurchaseDate : "";
    if (!purchaseDate) continue;
    const date = isoDate(purchaseDate);
    const amount = toNumber(order.OrderTotal?.Amount ?? 0);
    const units =
      toNumber(order.NumberOfItemsShipped ?? 0) + toNumber(order.NumberOfItemsUnshipped ?? 0);
    const prev = pointsMap.get(date) ?? { date, orders: 0, amount: 0, units: 0 };
    prev.orders += 1;
    prev.amount = Number((prev.amount + amount).toFixed(2));
    prev.units += units;
    pointsMap.set(date, prev);
  }
  return Array.from(pointsMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function buildResponseFromSalesOrderMetrics(args: {
  config: Awaited<ReturnType<typeof getConfig>>;
  lwaAccessToken: string;
  compare: boolean;
  createdAfterIso: string;
  current: { startMs: number; endMs: number };
  previous?: { startMs: number; endMs: number };
  meta: {
    days: number;
    compare: boolean;
    from?: string;
    to?: string;
    marketplaces: string[];
    region: string;
  };
}): Promise<
  | {
      meta: {
        days: number;
        compare: boolean;
        from?: string;
        to?: string;
        createdAfter: string;
        marketplaces: string[];
        region: string;
        dataSource: "sales_order_metrics";
      };
      summary: { orderCount: number; salesAmount: number; units: number; currency: string };
      previousSummary?: { orderCount: number; salesAmount: number; units: number; currency: string };
      revenueDeltaPct?: number | null;
      points: SalesPoint[];
      previousPoints?: SalesPoint[];
    }
  | null
> {
  const { config, lwaAccessToken, compare, createdAfterIso, current, previous, meta } = args;
  const spArgsBase = {
    endpoint: config.endpoint,
    region: config.region,
    awsAccessKeyId: config.awsAccessKeyId,
    awsSecretAccessKey: config.awsSecretAccessKey,
    awsSessionToken: config.awsSessionToken,
    lwaAccessToken,
    marketplaceIds: config.marketplaceIds,
  };

  if (compare && previous) {
    const [summary, previousSummary] = await Promise.all([
      fetchSalesOrderMetricsTotal({
        ...spArgsBase,
        startMs: current.startMs,
        endMs: current.endMs,
      }),
      fetchSalesOrderMetricsTotal({
        ...spArgsBase,
        startMs: previous.startMs,
        endMs: previous.endMs,
      }),
    ]);

    if (!summary || !previousSummary) {
      return null;
    }

    let revenueDeltaPct: number | null = null;
    if (previousSummary.salesAmount > 0) {
      revenueDeltaPct = Number(
        (
          ((summary.salesAmount - previousSummary.salesAmount) / previousSummary.salesAmount) *
          100
        ).toFixed(1)
      );
    }

    const [points, previousPoints] = await Promise.all([
      fetchSalesOrderMetricsDaySeries({
        ...spArgsBase,
        startMs: current.startMs,
        endMs: current.endMs,
      }),
      fetchSalesOrderMetricsDaySeries({
        ...spArgsBase,
        startMs: previous.startMs,
        endMs: previous.endMs,
      }),
    ]);

    return {
      meta: {
        ...meta,
        createdAfter: createdAfterIso,
        dataSource: "sales_order_metrics" as const,
      },
      summary,
      previousSummary,
      revenueDeltaPct,
      points: points ?? [],
      previousPoints: previousPoints ?? [],
    };
  }

  const summary = await fetchSalesOrderMetricsTotal({
    ...spArgsBase,
    startMs: current.startMs,
    endMs: current.endMs,
  });

  if (!summary) {
    return null;
  }

  const points =
    (await fetchSalesOrderMetricsDaySeries({
      ...spArgsBase,
      startMs: current.startMs,
      endMs: current.endMs,
    })) ?? [];

  return {
    meta: {
      ...meta,
      createdAfter: createdAfterIso,
      dataSource: "sales_order_metrics" as const,
    },
    summary,
    points,
  };
}

function parseYmdParam(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return raw;
}

function ymdToUtcRangeExclusiveEnd(fromYmd: string, toYmd: string): { startMs: number; endMs: number } {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  const startMs = Date.UTC(fy, fm - 1, fd);
  const endDay = new Date(Date.UTC(ty, tm - 1, td));
  endDay.setUTCDate(endDay.getUTCDate() + 1);
  return { startMs, endMs: endDay.getTime() };
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
    const compare =
      searchParams.get("compare") === "1" ||
      searchParams.get("compare") === "true" ||
      searchParams.get("compare") === "yes";
    const fromYmd = parseYmdParam(searchParams.get("from"));
    const toYmd = parseYmdParam(searchParams.get("to"));

    const now = Date.now();
    let days: number;
    let currentStartMs: number;
    let currentEndMs: number;
    let prevStartMs = 0;
    let prevEndMs = 0;
    let rangeFromLabel: string | undefined;
    let rangeToLabel: string | undefined;
    let fetchStartMs: number;
    let createdAfterIso: string;

    if (fromYmd && toYmd) {
      if (fromYmd > toYmd) {
        return NextResponse.json(
          { error: "Ungültiger Zeitraum: „von“ muss vor oder gleich „bis“ liegen." },
          { status: 400 }
        );
      }
      const r = ymdToUtcRangeExclusiveEnd(fromYmd, toYmd);
      currentStartMs = r.startMs;
      currentEndMs = r.endMs;
      const spanDays = Math.round((currentEndMs - currentStartMs) / DAY_MS);
      if (spanDays < 1 || spanDays > 60) {
        return NextResponse.json(
          { error: "Zeitraum muss 1–60 Tage umfassen." },
          { status: 400 }
        );
      }
      days = spanDays;
      rangeFromLabel = fromYmd;
      rangeToLabel = toYmd;
      if (compare) {
        const len = currentEndMs - currentStartMs;
        prevEndMs = currentStartMs;
        prevStartMs = currentStartMs - len;
        fetchStartMs = prevStartMs;
      } else {
        fetchStartMs = currentStartMs;
      }
      createdAfterIso = new Date(fetchStartMs).toISOString();
    } else {
      days = Math.min(Math.max(Number(searchParams.get("days") ?? "7") || 7, 1), 60);
      currentStartMs = now - days * DAY_MS;
      currentEndMs = now;
      if (compare) {
        prevStartMs = now - days * 2 * DAY_MS;
        prevEndMs = now - days * DAY_MS;
        fetchStartMs = prevStartMs;
      } else {
        fetchStartMs = currentStartMs;
      }
      createdAfterIso = new Date(fetchStartMs).toISOString();
    }

    const lwaAccessToken = await getLwaAccessToken({
      refreshToken: config.refreshToken,
      lwaClientId: config.lwaClientId,
      lwaClientSecret: config.lwaClientSecret,
    });

    const metaBase = {
      days,
      compare,
      ...(rangeFromLabel && rangeToLabel ? { from: rangeFromLabel, to: rangeToLabel } : {}),
      marketplaces: config.marketplaceIds,
      region: config.region,
    };

    const fromMetrics = await buildResponseFromSalesOrderMetrics({
      config,
      lwaAccessToken,
      compare,
      createdAfterIso,
      current: { startMs: currentStartMs, endMs: currentEndMs },
      previous: compare ? { startMs: prevStartMs, endMs: prevEndMs } : undefined,
      meta: metaBase,
    });
    if (fromMetrics) {
      return NextResponse.json(fromMetrics);
    }

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

    function orderBucket(order: AmazonOrder): "current" | "previous" | "all" | "skip" {
      const purchaseDate = typeof order.PurchaseDate === "string" ? order.PurchaseDate : "";
      if (!purchaseDate) return "skip";
      const t = new Date(purchaseDate).getTime();
      if (Number.isNaN(t)) return "skip";
      if (compare) {
        if (t >= currentStartMs && t < currentEndMs) return "current";
        if (t >= prevStartMs && t < prevEndMs) return "previous";
        return "skip";
      }
      if (t >= currentStartMs && t < currentEndMs) return "all";
      return "skip";
    }

    function aggregateBucket(orders: AmazonOrder[]) {
      let totalSalesAmount = 0;
      let totalUnits = 0;
      let currency = "EUR";
      for (const order of orders) {
        const amount = toNumber(order.OrderTotal?.Amount ?? 0);
        const units =
          toNumber(order.NumberOfItemsShipped ?? 0) + toNumber(order.NumberOfItemsUnshipped ?? 0);
        const code = order.OrderTotal?.CurrencyCode;
        if (typeof code === "string" && code) currency = code;
        totalSalesAmount += amount;
        totalUnits += units;
      }
      return {
        orderCount: orders.length,
        salesAmount: Number(totalSalesAmount.toFixed(2)),
        units: totalUnits,
        currency,
      };
    }

    const pointsMap = new Map<string, SalesPoint>();
    let totalSalesAmount = 0;
    let totalUnits = 0;
    let currency = "EUR";

    const ordersForPoints: AmazonOrder[] = allOrders.filter(
      (o) => orderBucket(o) === (compare ? "current" : "all")
    );

    for (const order of ordersForPoints) {
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

    if (compare) {
      const currentOrders = allOrders.filter((o) => orderBucket(o) === "current");
      const previousOrders = allOrders.filter((o) => orderBucket(o) === "previous");
      const summary = aggregateBucket(currentOrders);
      const previousSummary = aggregateBucket(previousOrders);
      const previousPoints = ordersToDailyPoints(previousOrders);
      let revenueDeltaPct: number | null = null;
      if (previousSummary.salesAmount > 0) {
        revenueDeltaPct = Number(
          (
            ((summary.salesAmount - previousSummary.salesAmount) / previousSummary.salesAmount) *
            100
          ).toFixed(1)
        );
      }

      return NextResponse.json({
        meta: {
          days,
          compare: true as const,
          createdAfter: createdAfterIso,
          marketplaces: config.marketplaceIds,
          region: config.region,
          dataSource: "orders_list" as const,
          ...(rangeFromLabel && rangeToLabel ? { from: rangeFromLabel, to: rangeToLabel } : {}),
        },
        summary,
        previousSummary,
        revenueDeltaPct,
        points,
        previousPoints,
      });
    }

    return NextResponse.json({
      meta: {
        days,
        compare: false as const,
        createdAfter: createdAfterIso,
        marketplaces: config.marketplaceIds,
        region: config.region,
        dataSource: "orders_list" as const,
        ...(rangeFromLabel && rangeToLabel ? { from: rangeFromLabel, to: rangeToLabel } : {}),
      },
      summary: {
        orderCount: allOrders.filter((o) => orderBucket(o) === "all").length,
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

