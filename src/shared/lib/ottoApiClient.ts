import { createAdminClient } from "@/shared/lib/supabase/admin";

export type OttoAmount = { amount?: number | string; currency?: string };

export type OttoPositionItem = {
  item_value_reduced_gross_price?: OttoAmount;
  itemValueReducedGrossPrice?: OttoAmount;
  item_value_gross_price?: OttoAmount;
  itemValueGrossPrice?: OttoAmount;
};

/** Rohes Order-Objekt der Otto API v4 (teilweise snake_case / camelCase). */
export type OttoOrder = {
  sales_order_id?: string;
  salesOrderId?: string;
  order_number?: string;
  orderNumber?: string;
  order_date?: string;
  orderDate?: string;
  position_items?: OttoPositionItem[];
  positionItems?: OttoPositionItem[];
  order_lifecycle_status?: string;
  orderLifecycleStatus?: string;
  fulfillment_status?: string;
  fulfillmentStatus?: string;
  [key: string]: unknown;
};

type OttoOrdersPayload = {
  resources?: OttoOrder[];
  links?: Array<{ href?: string; rel?: string }>;
};

export const OTTO_DAY_MS = 24 * 60 * 60 * 1000;

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

export function resolveOttoBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "https://api.otto.market";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, "");
  return `https://${trimmed.replace(/\/+$/, "")}`;
}

async function getSupabaseSecret(key: string): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("integration_secrets")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) return "";
    return ((data?.value as string | undefined) ?? "").trim();
  } catch {
    return "";
  }
}

export async function getOttoIntegrationConfig() {
  const baseUrl = resolveOttoBaseUrl(
    env("OTTO_API_BASE_URL") || (await getSupabaseSecret("OTTO_API_BASE_URL"))
  );
  const clientId = env("OTTO_API_CLIENT_ID") || (await getSupabaseSecret("OTTO_API_CLIENT_ID"));
  const clientSecret = env("OTTO_API_CLIENT_SECRET") || (await getSupabaseSecret("OTTO_API_CLIENT_SECRET"));
  const scopesRaw = env("OTTO_API_SCOPES") || (await getSupabaseSecret("OTTO_API_SCOPES")) || "orders";
  const scopes = scopesRaw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  return { baseUrl, clientId, clientSecret, scopes };
}

export async function getOttoAccessToken(args: {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
}) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    scope: args.scopes,
  });
  const res = await fetch(`${args.baseUrl}/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    throw new Error(`OTTO token request failed (${res.status}).`);
  }
  return token;
}

export function parseYmdParam(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return raw;
}

export function ymdToUtcRangeExclusiveEnd(fromYmd: string, toYmd: string): { startMs: number; endMs: number } {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  const startMs = Date.UTC(fy, fm - 1, fd);
  const endDay = new Date(Date.UTC(ty, tm - 1, td));
  endDay.setUTCDate(endDay.getUTCDate() + 1);
  return { startMs, endMs: endDay.getTime() };
}

async function fetchOrdersSlice(args: {
  baseUrl: string;
  token: string;
  fromIso: string;
  toIso: string;
  nextHref?: string;
}): Promise<{ resources: OttoOrder[]; nextHref?: string }> {
  const url = args.nextHref
    ? new URL(args.nextHref, args.baseUrl)
    : new URL("/v4/orders", args.baseUrl);
  if (!args.nextHref) {
    url.searchParams.set("fromOrderDate", args.fromIso);
    url.searchParams.set("toOrderDate", args.toIso);
    url.searchParams.set("orderColumnType", "ORDER_DATE");
    url.searchParams.set("limit", "128");
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${args.token}`,
      "X-Request-Timestamp": new Date().toISOString(),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: OttoOrdersPayload | null = null;
  try {
    json = text ? (JSON.parse(text) as OttoOrdersPayload) : null;
  } catch {
    json = null;
  }
  if (!res.ok || !json) {
    throw new Error(`OTTO orders request failed (${res.status}).`);
  }
  const links = Array.isArray(json.links) ? json.links : [];
  const nextHref = links.find((l) => l?.rel === "next")?.href;
  return { resources: Array.isArray(json.resources) ? json.resources : [], nextHref };
}

export async function fetchOttoOrdersRange(args: {
  baseUrl: string;
  token: string;
  startMs: number;
  endMs: number;
}): Promise<OttoOrder[]> {
  const fromIso = new Date(args.startMs).toISOString();
  const toIso = new Date(args.endMs).toISOString();
  const out: OttoOrder[] = [];
  let nextHref: string | undefined;
  for (let guard = 0; guard < 60; guard += 1) {
    const slice = await fetchOrdersSlice({
      baseUrl: args.baseUrl,
      token: args.token,
      fromIso,
      toIso,
      nextHref,
    });
    out.push(...slice.resources);
    if (!slice.nextHref) break;
    nextHref = slice.nextHref;
  }
  return out;
}
