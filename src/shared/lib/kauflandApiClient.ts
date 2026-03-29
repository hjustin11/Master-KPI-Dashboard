import crypto from "node:crypto";
import { createAdminClient } from "@/shared/lib/supabase/admin";

export type KauflandOrderUnit = {
  id_order_unit?: number;
  id_order?: string;
  ts_created_iso?: string;
  status?: string;
  /** Brutto in Cent */
  price?: number;
  revenue_gross?: number;
  storefront?: string;
};

export type KauflandOrdersListItem = {
  id_order?: string;
  ts_created_iso?: string;
  order_units_count?: number;
  storefront?: string;
};

export const KAUFLAND_DAY_MS = 24 * 60 * 60 * 1000;

function env(name: string) {
  return (process.env[name] ?? "").trim();
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

export function resolveKauflandBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "https://sellerapi.kaufland.com";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, "");
  return `https://${trimmed.replace(/\/+$/, "")}`;
}

/**
 * Kaufland Seller API: HMAC-SHA256 hex (nicht base64), siehe offizielle Doku.
 */
export function signKauflandRequest(args: {
  method: string;
  uri: string;
  body: string;
  timestamp: number;
  secretKey: string;
}): string {
  const plain = [args.method.toUpperCase(), args.uri, args.body, String(args.timestamp)].join("\n");
  return crypto.createHmac("sha256", args.secretKey).update(plain, "utf8").digest("hex");
}

export type KauflandIntegrationConfig = {
  baseUrl: string;
  clientKey: string;
  secretKey: string;
  userAgent: string;
  partnerClientKey: string;
  partnerSecretKey: string;
};

export async function getKauflandIntegrationConfig(): Promise<KauflandIntegrationConfig> {
  const baseUrl = resolveKauflandBaseUrl(
    env("KAUFLAND_API_BASE_URL") || (await getSupabaseSecret("KAUFLAND_API_BASE_URL"))
  );
  const clientKey = env("KAUFLAND_CLIENT_KEY") || (await getSupabaseSecret("KAUFLAND_CLIENT_KEY"));
  const secretKey = env("KAUFLAND_SECRET_KEY") || (await getSupabaseSecret("KAUFLAND_SECRET_KEY"));
  const userAgent =
    env("KAUFLAND_USER_AGENT") ||
    (await getSupabaseSecret("KAUFLAND_USER_AGENT")) ||
    "Inhouse_development";
  const partnerClientKey =
    env("KAUFLAND_PARTNER_CLIENT_KEY") || (await getSupabaseSecret("KAUFLAND_PARTNER_CLIENT_KEY"));
  const partnerSecretKey =
    env("KAUFLAND_PARTNER_SECRET_KEY") || (await getSupabaseSecret("KAUFLAND_PARTNER_SECRET_KEY"));
  return {
    baseUrl,
    clientKey,
    secretKey,
    userAgent,
    partnerClientKey,
    partnerSecretKey,
  };
}

export async function kauflandSignedFetch(
  config: KauflandIntegrationConfig,
  pathAndQuery: string
): Promise<Response> {
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  const uri = `${config.baseUrl.replace(/\/+$/, "")}${path}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signKauflandRequest({
    method: "GET",
    uri,
    body: "",
    timestamp,
    secretKey: config.secretKey,
  });
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Shop-Client-Key": config.clientKey,
    "Shop-Timestamp": String(timestamp),
    "Shop-Signature": signature,
    "User-Agent": config.userAgent,
  };
  if (config.partnerClientKey && config.partnerSecretKey) {
    const partnerSig = signKauflandRequest({
      method: "GET",
      uri,
      body: "",
      timestamp,
      secretKey: config.partnerSecretKey,
    });
    headers["Shop-Partner-Client-Key"] = config.partnerClientKey;
    headers["Shop-Partner-Signature"] = partnerSig;
  }
  return fetch(uri, { method: "GET", headers, cache: "no-store" });
}

type CollectionResponse<T> = {
  data?: T[];
  pagination?: { offset?: number; limit?: number; total?: number };
};

/**
 * Lädt Order-Units über mehrere Status-Werte (API liefert pro Status-Filter nur passende Einheiten).
 * Duplikate über `id_order_unit` werden zusammengeführt.
 */
export async function fetchKauflandOrderUnitsAllStatuses(args: {
  config: KauflandIntegrationConfig;
  /** Optional: z. B. de */
  storefront?: string;
  maxPagesPerStatus?: number;
}): Promise<KauflandOrderUnit[]> {
  const statuses = [
    "open",
    "need_to_be_sent",
    "sent",
    "returned",
    "cancelled",
  ];
  const seen = new Set<number>();
  const out: KauflandOrderUnit[] = [];
  const maxPages = args.maxPagesPerStatus ?? 40;

  for (const status of statuses) {
    let offset = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("offset", String(offset));
      params.set("status", status);
      if (args.storefront) params.set("storefront", args.storefront);
      const path = `/v2/order-units?${params.toString()}`;
      const res = await kauflandSignedFetch(args.config, path);
      const text = await res.text();
      let json: CollectionResponse<KauflandOrderUnit> | null = null;
      try {
        json = text ? (JSON.parse(text) as CollectionResponse<KauflandOrderUnit>) : null;
      } catch {
        json = null;
      }
      if (!res.ok || !json) {
        break;
      }
      const chunk = Array.isArray(json.data) ? json.data : [];
      for (const u of chunk) {
        const id = u.id_order_unit;
        if (typeof id === "number" && !seen.has(id)) {
          seen.add(id);
          out.push(u);
        }
      }
      const total = json.pagination?.total ?? 0;
      offset += chunk.length;
      if (chunk.length === 0 || offset >= total || chunk.length < 100) break;
    }
  }
  return out;
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

function parseUnitCreatedMs(u: KauflandOrderUnit): number | null {
  const raw = u.ts_created_iso;
  if (!raw || typeof raw !== "string") return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

export function filterOrderUnitsByCreatedRange(
  units: KauflandOrderUnit[],
  startMs: number,
  endMs: number
): KauflandOrderUnit[] {
  return units.filter((u) => {
    const t = parseUnitCreatedMs(u);
    if (t == null) return false;
    return t >= startMs && t < endMs;
  });
}

export function centsToAmount(cents: number | undefined): number {
  if (cents == null || !Number.isFinite(cents)) return 0;
  return Number((cents / 100).toFixed(2));
}
