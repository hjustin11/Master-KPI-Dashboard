import { NextResponse } from "next/server";
import {
  filterOrdersByCreatedRange,
  getFressnapfIntegrationConfig,
  parseYmdParam,
  readFressnapfOrdersNormalizedFromDashboard,
  ymdToUtcRangeExclusiveEnd,
} from "@/shared/lib/fressnapfApiClient";

const ORDERS_CACHE_MISS_HINT =
  "Keine gecachten Daten für diesen Zeitraum. Synchronisation läuft z. B. alle 15 Minuten oder über „Aktualisieren“.";
import { resolveSellerPortalOrderUrl } from "@/shared/lib/marketplaceSellerOrderLink";

export type FressnapfOrderListRow = {
  orderId: string;
  orderUrl?: string;
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

export async function GET(request: Request) {
  try {
    const config = await getFressnapfIntegrationConfig();
    const missing = {
      FRESSNAPF_API_BASE_URL: !config.baseUrl,
      FRESSNAPF_API_KEY: !config.apiKey,
    };
    if (Object.values(missing).some(Boolean)) {
      return NextResponse.json(
        {
          error: "Fressnapf API ist nicht vollständig konfiguriert.",
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

    const cached = await readFressnapfOrdersNormalizedFromDashboard(config, fromYmd, toYmd);
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
        items: [] as FressnapfOrderListRow[],
      });
    }

    const filtered = filterOrdersByCreatedRange(cached.value, startMs, endMs);

    const items: FressnapfOrderListRow[] = filtered.map((o) => ({
      orderId: o.id,
      orderUrl: resolveSellerPortalOrderUrl("Fressnapf", o.id) ?? undefined,
      purchaseDate: o.createdAt,
      amount: o.amount,
      currency: o.currency,
      units: o.units,
      statusRaw: o.status,
    }));

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
