import { NextResponse } from "next/server";
import {
  centsToAmount,
  fetchKauflandOrderUnitsAllStatuses,
  filterOrderUnitsByCreatedRange,
  getKauflandIntegrationConfig,
  parseYmdParam,
  ymdToUtcRangeExclusiveEnd,
  type KauflandOrderUnit,
} from "@/shared/lib/kauflandApiClient";

export type KauflandOrderListRow = {
  orderId: string;
  purchaseDate: string;
  amount: number;
  currency: string;
  units: number;
  statusRaw: string;
};

function localYmd(d: Date): string {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}

function pickOrderTs(list: KauflandOrderUnit[]): string {
  const times = list
    .map((u) => (u.ts_created_iso ? Date.parse(u.ts_created_iso) : NaN))
    .filter(Number.isFinite);
  if (!times.length) return new Date().toISOString();
  return new Date(Math.min(...times)).toISOString();
}

function mapGroupToRow(orderId: string, list: KauflandOrderUnit[]): KauflandOrderListRow {
  const amount = list.reduce(
    (s, u) =>
      s +
      centsToAmount(
        typeof u.price === "number"
          ? u.price
          : typeof u.revenue_gross === "number"
            ? u.revenue_gross
            : 0
      ),
    0
  );
  const statuses = list.map((u) => (typeof u.status === "string" ? u.status : "")).filter(Boolean);
  const statusRaw = statuses.length ? [...new Set(statuses)].join(", ") : "";

  return {
    orderId,
    purchaseDate: pickOrderTs(list),
    amount: Number(amount.toFixed(2)),
    currency: "EUR",
    units: list.length,
    statusRaw,
  };
}

export async function GET(request: Request) {
  try {
    const config = await getKauflandIntegrationConfig();
    const missing = {
      KAUFLAND_CLIENT_KEY: !config.clientKey,
      KAUFLAND_SECRET_KEY: !config.secretKey,
    };
    if (Object.values(missing).some(Boolean)) {
      return NextResponse.json(
        {
          error: "Kaufland API ist nicht vollständig konfiguriert.",
          missingKeys: Object.entries(missing).filter(([, v]) => v).map(([k]) => k),
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

    const allUnits = await fetchKauflandOrderUnitsAllStatuses({ config });
    const filtered = filterOrderUnitsByCreatedRange(allUnits, startMs, endMs);
    const byOrder = new Map<string, KauflandOrderUnit[]>();
    for (const u of filtered) {
      const oid = typeof u.id_order === "string" ? u.id_order.trim() : "";
      if (!oid) continue;
      const list = byOrder.get(oid) ?? [];
      list.push(u);
      byOrder.set(oid, list);
    }

    const items = Array.from(byOrder.entries()).map(([orderId, list]) => mapGroupToRow(orderId, list));

    return NextResponse.json({
      meta: {
        from: fromYmd,
        to: toYmd,
        baseUrl: config.baseUrl,
        storefront: config.storefront,
      },
      totalCount: items.length,
      items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
