import { NextResponse } from "next/server";
import { readFlexOrdersNormalizedFromDashboard } from "@/shared/lib/flexMarketplaceApiClient";
import {
  filterOrdersByCreatedRange,
  getMmsIntegrationConfig,
  mmsMissingKeysForConfig,
  parseYmdParam,
  ymdToUtcRangeExclusiveEnd,
} from "@/shared/lib/mmsApiClient";
import { resolveSellerPortalOrderUrl } from "@/shared/lib/marketplaceSellerOrderLink";

const ORDERS_CACHE_MISS_HINT =
  "Keine gecachten Daten für diesen Zeitraum. Synchronisation läuft z. B. alle 15 Minuten oder über „Aktualisieren“.";

export type MmsOrderListRow = {
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
    const config = await getMmsIntegrationConfig();
    const missing = mmsMissingKeysForConfig(config).filter((x) => x.missing);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "MediaMarkt & Saturn API ist nicht vollständig konfiguriert.",
          missingKeys: missing.map((m) => m.key),
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

    const cached = await readFlexOrdersNormalizedFromDashboard(config, fromYmd, toYmd);
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
        items: [] as MmsOrderListRow[],
      });
    }

    const filtered = filterOrdersByCreatedRange(cached.value, startMs, endMs);

    const items: MmsOrderListRow[] = filtered.map((o) => ({
      orderId: o.id,
      orderUrl: resolveSellerPortalOrderUrl("MediaMarkt & Saturn", o.id) ?? undefined,
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
