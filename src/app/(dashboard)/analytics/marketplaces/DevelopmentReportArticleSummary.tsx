"use client";

import { useMemo, useState } from "react";
import type { MarketplaceArticleSalesRow } from "@/shared/lib/marketplaceArticleLines";
import { MarketplaceBrandImg } from "@/shared/components/MarketplaceBrandImg";
import { devReportChannelBrand } from "./devReportChannelBrand";
import type { DevReportChannelId } from "./developmentReportSalesApi";
import {
  type DevelopmentArticleMetric,
  buildDevelopmentArticleMetrics,
  sortDevelopmentArticleMetrics,
} from "./developmentReportArticleMetrics";

export type DevelopmentReportArticleScopeNotice = {
  channelId: string;
  kind: "amazon" | "unsupported" | "error" | "empty";
  detail?: string;
};

function tone(v: number | null): string {
  if (v == null || v === 0) return "text-muted-foreground";
  return v > 0 ? "text-emerald-700" : "text-rose-700";
}

function fmtPct(v: number | null, locale: string): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString(locale, { maximumFractionDigits: 1 })} %`;
}

function isDevReportChannelId(v: string): v is DevReportChannelId {
  return (
    v === "amazon" ||
    v === "ebay" ||
    v === "otto" ||
    v === "kaufland" ||
    v === "fressnapf" ||
    v === "mediamarkt-saturn" ||
    v === "zooplus" ||
    v === "tiktok" ||
    v === "shopify"
  );
}

function aggregateOverallArticleMetrics(rows: MarketplaceArticleSalesRow[]): DevelopmentArticleMetric[] {
  const grouped = new Map<
    string,
    {
      key: string;
      title: string;
      unitsCurrent: number;
      unitsPrevious: number;
      revenueCurrent: number;
      revenuePrevious: number;
    }
  >();

  for (const row of rows) {
    const key = row.key || row.title;
    const existing = grouped.get(key);
    if (existing) {
      existing.unitsCurrent += row.unitsCurrent;
      existing.unitsPrevious += row.unitsPrevious;
      existing.revenueCurrent += row.revenueCurrent;
      existing.revenuePrevious += row.revenuePrevious;
      continue;
    }
    grouped.set(key, {
      key,
      title: row.title,
      unitsCurrent: row.unitsCurrent,
      unitsPrevious: row.unitsPrevious,
      revenueCurrent: row.revenueCurrent,
      revenuePrevious: row.revenuePrevious,
    });
  }

  return Array.from(grouped.values()).map((row) => {
    const unitsDeltaAbs = row.unitsCurrent - row.unitsPrevious;
    const revenueDeltaAbs = row.revenueCurrent - row.revenuePrevious;
    const unitsDeltaPct =
      row.unitsPrevious > 0 ? Number((((row.unitsCurrent - row.unitsPrevious) / row.unitsPrevious) * 100).toFixed(1)) : null;
    const revenueDeltaPct =
      row.revenuePrevious > 0
        ? Number((((row.revenueCurrent - row.revenuePrevious) / row.revenuePrevious) * 100).toFixed(1))
        : null;
    return {
      key: row.key,
      title: row.title,
      unitsCurrent: row.unitsCurrent,
      unitsDeltaAbs,
      unitsDeltaPct,
      revenueCurrent: row.revenueCurrent,
      revenueDeltaAbs,
      revenueDeltaPct,
      avgPriceCurrent: row.unitsCurrent > 0 ? Number((row.revenueCurrent / row.unitsCurrent).toFixed(2)) : null,
    };
  });
}

export function DevelopmentReportArticleSummary({
  channels,
  intlTag,
  currency,
  moverMetric,
  maxRows = 8,
  t,
}: {
  channels: Array<{ id: string; label: string; items: MarketplaceArticleSalesRow[] }>;
  intlTag: string;
  currency: string;
  moverMetric: "units" | "revenue";
  maxRows?: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [showAllByChannel, setShowAllByChannel] = useState<Record<string, boolean>>({});
  const nfInt = useMemo(() => new Intl.NumberFormat(intlTag), [intlTag]);
  const nfCurrency = useMemo(
    () => new Intl.NumberFormat(intlTag, { style: "currency", currency: currency || "EUR" }),
    [intlTag, currency]
  );

  if (channels.length === 0) return null;

  const mergedRows = sortDevelopmentArticleMetrics(
    aggregateOverallArticleMetrics(channels.flatMap((channel) => channel.items)),
    moverMetric
  );
  const mergedVisible = mergedRows.slice(0, Math.max(12, maxRows));

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border/60 bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">{t("devReport.articlesExecutiveHeading")}</h4>
          <p className="text-[11px] text-muted-foreground">
            {t("devReport.articlesExecutiveSortBy", {
              metric: moverMetric === "revenue" ? t("devReport.metricRevenue") : t("devReport.metricUnits"),
            })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs [font-variant-numeric:tabular-nums]">
            <thead>
              <tr className="border-b border-border/40 text-left">
                <th className="py-1 pr-2">{t("devReport.articleColItem")}</th>
                <th className="py-1 pr-2 text-right">{t("devReport.articleColUnitsTotal")}</th>
                <th className="py-1 pr-2 text-right">{t("devReport.articleColMoreSold")}</th>
                <th className="py-1 pr-2 text-right">{t("devReport.articleColAvgPrice")}</th>
                <th className="py-1 text-right">{t("devReport.articleColTotalRevenue")}</th>
              </tr>
            </thead>
            <tbody>
              {mergedVisible.map((row, index) => (
                <tr key={`merged-${row.key}-${index}`} className="border-b border-border/20 last:border-b-0">
                  <td className="py-1 pr-2">
                    <div className="line-clamp-2">{row.title}</div>
                    {row.key && row.key !== row.title ? (
                      <div className="text-[10px] text-muted-foreground">{row.key}</div>
                    ) : null}
                  </td>
                  <td className="py-1 pr-2 text-right">{nfInt.format(row.unitsCurrent)}</td>
                  <td className={tone(row.unitsDeltaAbs) + " py-1 pr-2 text-right"}>
                    {row.unitsDeltaAbs > 0 ? "+" : ""}
                    {nfInt.format(row.unitsDeltaAbs)} ({fmtPct(row.unitsDeltaPct, intlTag)})
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {row.avgPriceCurrent != null ? nfCurrency.format(row.avgPriceCurrent) : "—"}
                  </td>
                  <td className="py-1 text-right">{nfCurrency.format(row.revenueCurrent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {channels.map((channel) => {
        const sorted = sortDevelopmentArticleMetrics(buildDevelopmentArticleMetrics(channel.items), moverMetric);
        const showAll = !!showAllByChannel[channel.id];
        const visible = showAll ? sorted : sorted.slice(0, maxRows);
        return (
          <section key={channel.id} className="rounded-lg border border-border/50 p-2">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <span className="inline-flex h-5 w-14 items-center justify-start" aria-hidden>
                  <MarketplaceBrandImg
                    src={isDevReportChannelId(channel.id) ? devReportChannelBrand(channel.id).logoSrc : "/brand/marketplaces/shopify.svg"}
                    alt=""
                    className="max-h-5 max-w-full object-contain object-left"
                  />
                </span>
                <span>{channel.label}</span>
              </h4>
              <p className="text-[11px] text-muted-foreground">
                {t("devReport.topItemsByMetric", {
                  metric: moverMetric === "revenue" ? t("devReport.metricRevenue") : t("devReport.metricUnits"),
                })}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs [font-variant-numeric:tabular-nums]">
                <thead>
                  <tr className="border-b border-border/40 text-left">
                    <th className="py-1 pr-2">{t("devReport.articleColItem")}</th>
                    <th className="py-1 pr-2 text-right">{t("devReport.metricUnits")}</th>
                    <th className="py-1 pr-2 text-right">{t("devReport.articleColDeltaUnits")}</th>
                    <th className="py-1 pr-2 text-right">{t("devReport.metricRevenue")}</th>
                    <th className="py-1 pr-2 text-right">{t("devReport.articleColDeltaRevenue")}</th>
                    <th className="py-1 text-right">{t("devReport.articleColAvgPrice")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.key} className="border-b border-border/20 last:border-b-0">
                      <td className="py-1 pr-2">
                        <div className="line-clamp-2">{row.title}</div>
                        {row.key && row.key !== row.title ? (
                          <div className="text-[10px] text-muted-foreground">{row.key}</div>
                        ) : null}
                      </td>
                      <td className="py-1 pr-2 text-right">{nfInt.format(row.unitsCurrent)}</td>
                      <td className={`py-1 pr-2 text-right ${tone(row.unitsDeltaAbs)}`}>
                        {row.unitsDeltaAbs > 0 ? "+" : ""}
                        {nfInt.format(row.unitsDeltaAbs)} ({fmtPct(row.unitsDeltaPct, intlTag)})
                      </td>
                      <td className="py-1 pr-2 text-right">{nfCurrency.format(row.revenueCurrent)}</td>
                      <td className={`py-1 pr-2 text-right ${tone(row.revenueDeltaAbs)}`}>
                        {row.revenueDeltaAbs > 0 ? "+" : ""}
                        {nfCurrency.format(row.revenueDeltaAbs)} ({fmtPct(row.revenueDeltaPct, intlTag)})
                      </td>
                      <td className="py-1 text-right">
                        {row.avgPriceCurrent != null ? nfCurrency.format(row.avgPriceCurrent) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sorted.length > maxRows ? (
              <button
                type="button"
                className="mt-2 text-xs text-primary underline-offset-4 hover:underline"
                onClick={() =>
                  setShowAllByChannel((prev) => ({
                    ...prev,
                    [channel.id]: !showAll,
                  }))
                }
              >
                {showAll
                  ? t("devReport.showLess")
                  : t("devReport.showAllCount", { count: sorted.length })}
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
