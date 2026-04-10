import { NextResponse } from "next/server";
import type { OttoOrder } from "@/shared/lib/ottoApiClient";
import {
  getOttoIntegrationConfig,
  parseYmdParam,
  readOttoOrdersFromDashboard,
  ymdToUtcRangeExclusiveEnd,
} from "@/shared/lib/ottoApiClient";

const ORDERS_CACHE_MISS_HINT =
  "Keine gecachten Daten für diesen Zeitraum. Synchronisation läuft z. B. alle 15 Minuten oder über „Aktualisieren“.";
import { INTEGRATION_SECRETS_CONFIGURATION_HINT_DE } from "@/shared/lib/integrationSecrets";
import { resolveSellerPortalOrderUrl } from "@/shared/lib/marketplaceSellerOrderLink";

export type OttoOrderListRow = {
  orderId: string;
  orderUrl?: string;
  purchaseDate: string;
  amount: number;
  currency: string;
  units: number;
  /** Rohwert der Otto-API (Anzeige & Heuristik in der UI). */
  statusRaw: string;
};

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function localYmd(d: Date): string {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}

function pickStatusRaw(order: OttoOrder): string {
  const candidates = [
    order.order_lifecycle_status,
    order.orderLifecycleStatus,
    order.fulfillment_status,
    order.fulfillmentStatus,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

function mapOrderToRow(order: OttoOrder): OttoOrderListRow | null {
  const orderDate =
    typeof order.order_date === "string"
      ? order.order_date
      : typeof order.orderDate === "string"
        ? order.orderDate
        : "";
  if (!orderDate) return null;

  const id =
    String(order.order_number ?? order.orderNumber ?? order.sales_order_id ?? order.salesOrderId ?? "").trim() ||
    "";

  const positionItems = Array.isArray(order.position_items)
    ? order.position_items
    : Array.isArray(order.positionItems)
      ? order.positionItems
      : [];

  let amount = 0;
  let units = 0;
  let currency = "EUR";

  for (const item of positionItems) {
    const reduced = item.item_value_reduced_gross_price ?? item.itemValueReducedGrossPrice;
    const gross = item.item_value_gross_price ?? item.itemValueGrossPrice;
    const price = reduced ?? gross;
    amount += toNumber(price?.amount ?? 0);
    const code = price?.currency;
    if (typeof code === "string" && code) currency = code;
    units += 1;
  }

  const statusRaw = pickStatusRaw(order);

  return {
    orderId: id || orderDate,
    orderUrl: resolveSellerPortalOrderUrl("Otto", id || orderDate) ?? undefined,
    purchaseDate: orderDate,
    amount: Number(amount.toFixed(2)),
    currency,
    units,
    statusRaw,
  };
}

export async function GET(request: Request) {
  try {
    const config = await getOttoIntegrationConfig();
    const missing = {
      OTTO_API_CLIENT_ID: !config.clientId,
      OTTO_API_CLIENT_SECRET: !config.clientSecret,
    };
    if (Object.values(missing).some(Boolean)) {
      return NextResponse.json(
        {
          error: "Otto API ist nicht vollständig konfiguriert.",
          missingKeys: Object.entries(missing).filter(([, v]) => v).map(([k]) => k),
          hint: INTEGRATION_SECRETS_CONFIGURATION_HINT_DE,
          integrationSecretsLoadErrors: config.integrationSecretsLoadErrors,
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const fromYmd = parseYmdParam(searchParams.get("from")) ?? localYmd(yesterday);
    const toYmd = parseYmdParam(searchParams.get("to")) ?? localYmd(now);

    if (fromYmd > toYmd) {
      return NextResponse.json(
        { error: "Ungültiger Zeitraum: „von“ muss vor oder gleich „bis“ liegen." },
        { status: 400 }
      );
    }

    const { startMs, endMs } = ymdToUtcRangeExclusiveEnd(fromYmd, toYmd);
    const spanDays = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
    if (spanDays < 1 || spanDays > 60) {
      return NextResponse.json({ error: "Zeitraum muss 1–60 Tage umfassen." }, { status: 400 });
    }

    const cached = await readOttoOrdersFromDashboard(config.baseUrl, fromYmd, toYmd);
    if (cached.state === "miss") {
      return NextResponse.json({
        meta: {
          from: fromYmd,
          to: toYmd,
          baseUrl: config.baseUrl,
          cacheState: "miss" as const,
          cacheMessage: ORDERS_CACHE_MISS_HINT,
        },
        totalCount: 0,
        items: [] as OttoOrderListRow[],
      });
    }

    const items = cached.value
      .map(mapOrderToRow)
      .filter((row): row is OttoOrderListRow => {
        if (!row) return false;
        const t = Date.parse(row.purchaseDate);
        return !Number.isNaN(t) && t >= startMs && t < endMs;
      });

    return NextResponse.json({
      meta: {
        from: fromYmd,
        to: toYmd,
        baseUrl: config.baseUrl,
        cacheState: cached.state,
        cacheUpdatedAt: cached.updatedAt,
      },
      totalCount: items.length,
      items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
