/**
 * Mirakl-basierte Settlement-Daten abrufen.
 * Mirakl API: GET /api/invoices (Abrechnungen) — gemeinsam für Otto, Kaufland, Fressnapf, MMS, Zooplus.
 *
 * Jeder Mirakl-Marktplatz stellt eine baseUrl + API-Key bereit.
 * Die Invoice-API liefert Abrechnungspositionen mit Provision, Versand, Erstattungen.
 */

import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";

const LOG = "[payouts:mirakl]";

type MiraklConfig = {
  slug: string;
  baseUrl: string;
  apiKey: string;
};

const SLUG_TO_ENV: Record<string, { baseUrlKey: string; apiKeyKey: string }> = {
  otto: { baseUrlKey: "OTTO_API_BASE_URL", apiKeyKey: "OTTO_API_KEY" },
  kaufland: { baseUrlKey: "KAUFLAND_API_BASE_URL", apiKeyKey: "KAUFLAND_API_KEY" },
  fressnapf: { baseUrlKey: "FRESSNAPF_API_BASE_URL", apiKeyKey: "FRESSNAPF_API_KEY" },
  "mediamarkt-saturn": { baseUrlKey: "MMS_API_BASE_URL", apiKeyKey: "MMS_API_KEY" },
  zooplus: { baseUrlKey: "ZOOPLUS_API_BASE_URL", apiKeyKey: "ZOOPLUS_API_KEY" },
};

export const MIRAKL_PAYOUT_SLUGS = Object.keys(SLUG_TO_ENV);

async function loadMiraklConfig(slug: string): Promise<MiraklConfig | null> {
  const envMapping = SLUG_TO_ENV[slug];
  if (!envMapping) return null;
  const baseUrl = (
    process.env[envMapping.baseUrlKey] ||
    (await getIntegrationSecretValue(envMapping.baseUrlKey)) ||
    ""
  ).trim().replace(/\/+$/, "");
  const apiKey = (
    process.env[envMapping.apiKeyKey] ||
    (await getIntegrationSecretValue(envMapping.apiKeyKey)) ||
    ""
  ).trim();
  if (!baseUrl || !apiKey) {
    console.warn(`${LOG} ${slug}: config missing (baseUrl=${Boolean(baseUrl)}, apiKey=${Boolean(apiKey)})`);
    return null;
  }
  return { slug, baseUrl, apiKey };
}

export type MiraklInvoice = {
  invoiceId: string;
  dateCreated: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
  commissionAmount: number;
  shippingAmount: number;
  refundsAmount: number;
  otherAmount: number;
  ordersCount: number;
  currency: string;
};

/**
 * Holt Mirakl-Invoices für einen Marktplatz.
 * Mirakl API GET /api/invoices?startDate=...&endDate=...
 */
export async function fetchMiraklInvoices(
  slug: string,
  sinceDaysAgo = 90
): Promise<MiraklInvoice[]> {
  const config = await loadMiraklConfig(slug);
  if (!config) return [];

  const since = new Date(Date.now() - sinceDaysAgo * 86_400_000).toISOString().slice(0, 10);
  const url = `${config.baseUrl}/api/invoices?startDate=${since}`;

  console.info(`${LOG} ${slug}: fetching invoices since ${since}`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: config.apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`${LOG} ${slug}: invoices API HTTP ${res.status}`, text.slice(0, 300));
    // Fallback: versuche /api/accounting/debits (alternative Mirakl-Endpoints)
    return fetchMiraklAccountingFallback(config, since);
  }

  const body = (await res.json().catch(() => null)) as { invoices?: unknown[] } | null;
  if (!body?.invoices || !Array.isArray(body.invoices)) {
    console.warn(`${LOG} ${slug}: keine Invoices im Response.`);
    return [];
  }

  return body.invoices.map((inv) => parseMiraklInvoice(inv as Record<string, unknown>, config.slug));
}

async function fetchMiraklAccountingFallback(
  config: MiraklConfig,
  since: string
): Promise<MiraklInvoice[]> {
  // Einige Mirakl-Instanzen nutzen /api/accounting/debits statt /api/invoices
  const url = `${config.baseUrl}/api/accounting/debits?startDate=${since}&pageSize=50`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: config.apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    console.warn(`${LOG} ${config.slug}: accounting/debits fallback also failed: HTTP ${res.status}`);
    return [];
  }

  const body = (await res.json().catch(() => null)) as { orders?: unknown[]; debits?: unknown[] } | null;
  const items = body?.debits ?? body?.orders ?? [];
  if (!Array.isArray(items) || items.length === 0) return [];

  // Aggregiere pro Monat/Periode
  return aggregateDebitsToInvoices(items as Array<Record<string, unknown>>, config.slug);
}

function parseMiraklInvoice(raw: Record<string, unknown>, slug: string): MiraklInvoice {
  const num = (key: string) => {
    const v = raw[key];
    if (typeof v === "number") return v;
    if (typeof v === "string") return parseFloat(v) || 0;
    return 0;
  };
  const str = (key: string) => String(raw[key] ?? "").trim();

  return {
    invoiceId: str("invoice_id") || str("id") || `${slug}-${Date.now()}`,
    dateCreated: str("date_created") || str("created_date") || "",
    startDate: str("start_date") || str("period_start") || "",
    endDate: str("end_date") || str("period_end") || "",
    totalAmount: num("total_amount") || num("amount_transferred"),
    commissionAmount: num("commission_amount") || num("total_commission"),
    shippingAmount: num("shipping_amount") || num("total_shipping"),
    refundsAmount: num("refund_amount") || num("total_refunds"),
    otherAmount: num("other_amount") || num("subscription_amount"),
    ordersCount: Math.round(num("orders_count") || num("nb_orders")),
    currency: str("currency_code") || "EUR",
  };
}

function aggregateDebitsToInvoices(
  debits: Array<Record<string, unknown>>,
  slug: string
): MiraklInvoice[] {
  // Gruppiere nach Monat
  const byMonth = new Map<string, { total: number; commission: number; shipping: number; refunds: number; orders: number }>();

  for (const d of debits) {
    const date = String(d.date_created ?? d.created_date ?? "").slice(0, 7) || "unknown";
    const entry = byMonth.get(date) ?? { total: 0, commission: 0, shipping: 0, refunds: 0, orders: 0 };
    const amount = typeof d.amount === "number" ? d.amount : parseFloat(String(d.amount ?? "0")) || 0;
    const type = String(d.type ?? d.transaction_type ?? "");
    if (type.includes("COMMISSION") || type.includes("commission")) {
      entry.commission += Math.abs(amount);
    } else if (type.includes("REFUND") || type.includes("refund")) {
      entry.refunds += Math.abs(amount);
    } else if (type.includes("SHIPPING") || type.includes("shipping")) {
      entry.shipping += Math.abs(amount);
    }
    entry.total += amount;
    entry.orders++;
    byMonth.set(date, entry);
  }

  return Array.from(byMonth.entries()).map(([month, agg]) => ({
    invoiceId: `${slug}-${month}`,
    dateCreated: `${month}-01`,
    startDate: `${month}-01`,
    endDate: `${month}-28`,
    totalAmount: Math.round(agg.total * 100) / 100,
    commissionAmount: Math.round(agg.commission * 100) / 100,
    shippingAmount: Math.round(agg.shipping * 100) / 100,
    refundsAmount: Math.round(agg.refunds * 100) / 100,
    otherAmount: 0,
    ordersCount: agg.orders,
    currency: "EUR",
  }));
}
