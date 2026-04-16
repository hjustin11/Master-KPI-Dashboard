"use client";

import Image from "next/image";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";
import type { PayoutRow } from "@/shared/lib/payouts/payoutTypes";
import { useTranslation } from "@/i18n/I18nProvider";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function resolveMeta(slug: string) {
  if (slug === "amazon") return { label: "Amazon", logo: "/brand/marketplaces/amazon.svg" };
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

  // Aggregate per marketplace
  const bySlug = new Map<string, { gross: number; fees: number; ads: number; refunds: number; net: number; ratio: number }>();
  for (const r of rows) {
    const entry = bySlug.get(r.marketplaceSlug) ?? { gross: 0, fees: 0, ads: 0, refunds: 0, net: 0, ratio: 0 };
    entry.gross += r.grossSales;
    entry.fees += r.marketplaceFees + r.fulfillmentFees;
    entry.ads += r.advertisingFees;
    entry.refunds += r.refundsAmount;
    entry.net += r.netPayout;
    bySlug.set(r.marketplaceSlug, entry);
  }
  for (const [, v] of bySlug) {
    v.ratio = v.gross > 0 ? v.net / v.gross : 0;
  }

  const sorted = Array.from(bySlug.entries()).sort((a, b) => b[1].gross - a[1].gross);

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t("payouts.loading")}</p>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t("payouts.noData")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left">{t("payouts.table.marketplace")}</th>
            <th className="px-3 py-2 text-right">{t("payouts.table.gross")}</th>
            <th className="px-3 py-2 text-right">{t("payouts.table.fees")}</th>
            <th className="px-3 py-2 text-right">{t("payouts.table.ads")}</th>
            <th className="px-3 py-2 text-right">{t("payouts.table.returns")}</th>
            <th className="px-3 py-2 text-right">{t("payouts.table.net")}</th>
            <th className="px-3 py-2 text-right">{t("payouts.kpi.payoutRatio")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([slug, agg]) => {
            const meta = resolveMeta(slug);
            return (
              <tr key={slug} className="border-b last:border-0 hover:bg-muted/20">
                <td className="flex items-center gap-2 px-3 py-2">
                  {meta.logo && (
                    <Image src={meta.logo} alt={meta.label} width={20} height={20} className="h-5 w-5 object-contain" unoptimized />
                  )}
                  <span className="font-medium">{meta.label}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatEur(agg.gross)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-600">{formatEur(-agg.fees)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-600">{formatEur(-agg.ads)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-600">{formatEur(-agg.refunds)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatEur(agg.net)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className={agg.ratio < 0.35 ? "text-rose-600" : agg.ratio < 0.5 ? "text-amber-600" : "text-emerald-600"}>
                    {pct(agg.ratio)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
