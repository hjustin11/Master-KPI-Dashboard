"use client";

import Image from "next/image";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";
import { getAmazonMarketplaceBySlug } from "@/shared/config/amazonMarketplaces";
import type { PayoutRow } from "@/shared/lib/payouts/payoutTypes";
import { useTranslation } from "@/i18n/I18nProvider";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)} %`;
}

function resolveMeta(slug: string) {
  // Legacy-Slug 'amazon' zeigt weiterhin generische Amazon-Karte (falls alte Rows
  // noch nicht migriert sind).
  if (slug === "amazon") return { label: "Amazon", logo: "/brand/marketplaces/amazon.svg" };
  // Neue Country-Slugs 'amazon-de', 'amazon-fr', ...
  const amzCountry = getAmazonMarketplaceBySlug(slug);
  if (amzCountry) {
    return {
      label: `${amzCountry.countryFlag} ${amzCountry.shortName}`,
      logo: "/brand/marketplaces/amazon.svg",
    };
  }
  const m = ANALYTICS_MARKETPLACES.find((x) => x.slug === slug);
  return { label: m?.label ?? slug, logo: m?.logo ?? "" };
}

export function PayoutsMarketplaceTable({
  rows,
  loading,
}: {
  rows: PayoutRow[];
  loading: boolean;
}) {
  const { t } = useTranslation();

  const bySlug = new Map<string, { gross: number; fees: number; ads: number; refunds: number; net: number; orders: number; ratio: number }>();
  for (const r of rows) {
    const entry = bySlug.get(r.marketplaceSlug) ?? { gross: 0, fees: 0, ads: 0, refunds: 0, net: 0, orders: 0, ratio: 0 };
    entry.gross += r.grossSales;
    entry.fees += Math.abs(r.marketplaceFees) + Math.abs(r.fulfillmentFees);
    entry.ads += Math.abs(r.advertisingFees);
    entry.refunds += Math.abs(r.refundsAmount);
    entry.net += r.netPayout;
    entry.orders += r.ordersCount;
    bySlug.set(r.marketplaceSlug, entry);
  }
  for (const [, v] of bySlug) {
    v.ratio = v.gross > 0 ? v.net / v.gross : 0;
  }

  const sorted = Array.from(bySlug.entries()).sort((a, b) => b[1].gross - a[1].gross);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-card">
        <p className="text-sm text-gray-500">{t("payouts.loading")}</p>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-card">
        <p className="text-sm text-gray-500">{t("payouts.noData")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm dark:bg-card">
      <div className="px-6 pt-6 pb-3">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">
          Marktplatz-Übersicht
        </h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Alle Marktplätze im gewählten Zeitraum
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
              <th className="px-4 py-2.5 text-left">{t("payouts.table.marketplace")}</th>
              <th className="px-4 py-2.5 text-right">{t("payouts.table.gross")}</th>
              <th className="px-4 py-2.5 text-right">{t("payouts.table.fees")}</th>
              <th className="px-4 py-2.5 text-right">{t("payouts.table.ads")}</th>
              <th className="px-4 py-2.5 text-right">{t("payouts.table.returns")}</th>
              <th className="px-4 py-2.5 text-right">{t("payouts.table.net")}</th>
              <th className="px-4 py-2.5 text-right">{t("payouts.kpi.payoutRatio")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([slug, agg]) => {
              const meta = resolveMeta(slug);
              return (
                <tr key={slug} className="border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50/50 dark:border-gray-800 dark:hover:bg-gray-800/30">
                  <td className="flex items-center gap-2.5 px-4 py-3">
                    {meta.logo && (
                      <Image src={meta.logo} alt={meta.label} width={20} height={20} className="h-5 w-5 object-contain" unoptimized />
                    )}
                    <div>
                      <span className="font-semibold text-gray-800 dark:text-white">{meta.label}</span>
                      <span className="ml-2 text-[10px] text-gray-400">{agg.orders} Best.</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-700 dark:text-gray-300">{formatEur(agg.gross)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{formatEur(-agg.fees)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{formatEur(-agg.ads)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{formatEur(-agg.refunds)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900 dark:text-white">{formatEur(agg.net)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                      agg.ratio < 0.35
                        ? "bg-gray-800 text-white dark:bg-white dark:text-black"
                        : agg.ratio < 0.5
                          ? "bg-gray-400 text-white dark:bg-gray-500 dark:text-white"
                          : "bg-black text-white dark:bg-white dark:text-black"
                    }`}>
                      {pct(agg.ratio)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
