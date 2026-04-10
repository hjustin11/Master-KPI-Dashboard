"use client";

import { DevelopmentReportArticleSummary, type DevelopmentReportArticleScopeNotice } from "./DevelopmentReportArticleSummary";
import type { MarketplaceReportRow } from "./MarketplaceReportPrintView";
import type { DevReportChannelId } from "./developmentReportSalesApi";
import type { MarketplaceArticleSalesRow } from "@/shared/lib/marketplaceArticleLines";
import { MarketplaceBrandImg } from "@/shared/components/MarketplaceBrandImg";
import { devReportChannelBrand } from "./devReportChannelBrand";
import { cn } from "@/lib/utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function pct(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function toneClass(v: number | null): string {
  if (v == null || v === 0) return "text-muted-foreground";
  return v > 0 ? "text-emerald-700" : "text-rose-700";
}

function fmtPct(v: number | null, intlTag: string): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString(intlTag, { maximumFractionDigits: 1 })} %`;
}

export function DevelopmentReportVisualKpi({
  rows,
  periodFrom,
  periodTo,
  previousFrom,
  previousTo,
  generatedAt,
  intlTag,
  articleSummaryChannels,
  articleSummaryCurrency,
  moverMetric,
  articlesLoading,
  articleScopeNotices,
  presentationMode = false,
  t,
}: {
  rows: MarketplaceReportRow[];
  periodFrom: string;
  periodTo: string;
  previousFrom: string;
  previousTo: string;
  generatedAt: Date;
  intlTag: string;
  articleSummaryChannels: Array<{ id: DevReportChannelId; label: string; items: MarketplaceArticleSalesRow[] }>;
  articleSummaryCurrency: string;
  moverMetric: "units" | "revenue";
  articlesLoading: boolean;
  articleScopeNotices: DevelopmentReportArticleScopeNotice[];
  presentationMode?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const nfInt = new Intl.NumberFormat(intlTag);
  const nfCurrency = (n: number, c: string) =>
    new Intl.NumberFormat(intlTag, { style: "currency", currency: c || "EUR" }).format(n);
  const channelRows = rows.filter((r) => r.id !== "total");
  const chartData = channelRows.map((r) => ({
    id: r.id,
    label: r.label,
    currentRevenue: Number(r.currentRevenue.toFixed(2)),
    previousRevenue: Number(r.previousRevenue.toFixed(2)),
    revenueDeltaPct: pct(r.currentRevenue, r.previousRevenue) ?? 0,
    unitsDeltaPct: pct(r.currentUnits, r.previousUnits) ?? 0,
  }));
  const mixData = chartData
    .filter((d) => d.currentRevenue > 0)
    .map((d) => ({ name: d.label, value: d.currentRevenue, id: d.id }));
  const mixTotal = mixData.reduce((s, d) => s + d.value, 0);
  const mixColors = ["#2563eb", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9", "#84cc16", "#f97316", "#64748b"];
  const total = rows.find((r) => r.id === "total");
  const executive = (() => {
    const source = total ?? channelRows[0];
    if (!source) return null;
    const revPct = pct(source.currentRevenue, source.previousRevenue);
    const unitPct = pct(source.currentUnits, source.previousUnits);
    const netPct = pct(source.currentNet, source.previousNet);
    return { source, revPct, unitPct, netPct };
  })();

  const topChannelsByRevenue = [...channelRows]
    .sort((a, b) => b.currentRevenue - a.currentRevenue)
    .slice(0, 3)
    .map((row) => `${row.label} (${fmtPct(pct(row.currentRevenue, row.previousRevenue), intlTag)})`)
    .join(" · ");

  const pieLabelRenderer = (entry: {
    cx?: number;
    cy?: number;
    midAngle?: number;
    outerRadius?: number;
    percent?: number;
    name?: string;
  }) => {
    const { cx, cy, midAngle, outerRadius, percent, name } = entry;
    const percentValue = Number(percent ?? 0);
    if (!Number.isFinite(percentValue) || percentValue <= 0) return null;
    const angle = ((Number(midAngle) ?? 0) * Math.PI) / 180;
    const radius = Number(outerRadius) ?? 0;
    const x1 = Number(cx) + Math.cos(-angle) * (radius + 4);
    const y1 = Number(cy) + Math.sin(-angle) * (radius + 4);
    const x2 = Number(cx) + Math.cos(-angle) * (radius + 24);
    const y2 = Number(cy) + Math.sin(-angle) * (radius + 24);
    const rightSide = x2 >= Number(cx);
    const x3 = x2 + (rightSide ? 18 : -18);
    const textAnchor = rightSide ? "start" : "end";
    return (
      <g>
        <path d={`M${x1},${y1} L${x2},${y2} L${x3},${y2}`} stroke="#64748b" strokeWidth={1} fill="none" />
        <text x={x3 + (rightSide ? 2 : -2)} y={y2} textAnchor={textAnchor} dominantBaseline="central" fontSize={11} fill="#334155">
          {`${name} - ${(percentValue * 100).toFixed(1)}%`}
        </text>
      </g>
    );
  };

  return (
    <div className={cn("space-y-4", presentationMode && "space-y-5")}>
      <div className="rounded-lg border border-border/60 bg-muted/10 p-2 text-xs text-muted-foreground">
        <p>
          Berichtszeitraum: {periodFrom} bis {periodTo}
        </p>
        <p>
          Vergleich: {previousFrom} bis {previousTo}
        </p>
        <p>Generiert: {generatedAt.toLocaleString(intlTag)}</p>
      </div>

      {executive ? (
        <section className="space-y-3 rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-base font-semibold">{t("devReport.heroHeading")}</h3>
            <p className="text-xs text-muted-foreground">{t("devReport.heroSubheading")}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-xl border border-border/60 bg-background/90 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("devReport.revenueDeltaCard")}</p>
              <p className={cn("mt-1 text-3xl font-bold tracking-tight", toneClass(executive.revPct))}>
                {fmtPct(executive.revPct, intlTag)}
              </p>
              <p className="mt-1 text-sm font-medium">
                {nfCurrency(executive.source.currentRevenue, executive.source.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("devReport.vsPrevious")}: {nfCurrency(executive.source.previousRevenue, executive.source.currency)}
              </p>
            </article>
            <article className="rounded-xl border border-border/60 bg-background/90 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("devReport.unitsDeltaCard")}</p>
              <p className={cn("mt-1 text-3xl font-bold tracking-tight", toneClass(executive.unitPct))}>
                {fmtPct(executive.unitPct, intlTag)}
              </p>
              <p className="mt-1 text-sm font-medium">{nfInt.format(executive.source.currentUnits)}</p>
              <p className="text-xs text-muted-foreground">
                {t("devReport.vsPrevious")}: {nfInt.format(executive.source.previousUnits)}
              </p>
            </article>
            <article className="rounded-xl border border-border/60 bg-background/90 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("devReport.netDeltaCard")}</p>
              <p className={cn("mt-1 text-3xl font-bold tracking-tight", toneClass(executive.netPct))}>
                {fmtPct(executive.netPct, intlTag)}
              </p>
              <p className="mt-1 text-sm font-medium">{nfCurrency(executive.source.currentNet, executive.source.currency)}</p>
              <p className="text-xs text-muted-foreground">
                {t("devReport.vsPrevious")}: {nfCurrency(executive.source.previousNet, executive.source.currency)}
              </p>
            </article>
          </div>
          {topChannelsByRevenue ? (
            <p className="rounded-md border border-border/50 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              {t("devReport.heroDrivers")}: {topChannelsByRevenue}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        <section className="min-w-0 rounded-xl border border-border/60 bg-card p-3">
          <div className="mb-2">
            <h4 className="text-sm font-semibold">{t("devReport.chartRevenueCompare")}</h4>
            {!presentationMode ? <p className="text-[11px] text-muted-foreground">{t("devReport.chartRevenueCompareHint")}</p> : null}
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 4, right: 10, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(v) => nfCurrency(Number(v ?? 0), "EUR")} />
                <Bar dataKey="currentRevenue" fill="#2563eb" name="Aktuell" radius={[4, 4, 0, 0]} />
                <Bar dataKey="previousRevenue" fill="#94a3b8" name="Vergleich" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-border/60 bg-card p-3">
          <div className="mb-2">
            <h4 className="text-sm font-semibold">{t("devReport.chartDelta")}</h4>
            {!presentationMode ? <p className="text-[11px] text-muted-foreground">{t("devReport.chartDeltaHint")}</p> : null}
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 4, right: 10, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} unit="%" />
                <Tooltip formatter={(v) => `${Number(v ?? 0).toFixed(1)} %`} />
                <Bar dataKey="revenueDeltaPct" name="Δ Umsatz" radius={[6, 6, 0, 0]}>
                  {chartData.map((d) => (
                    <Cell key={d.id} fill={d.revenueDeltaPct >= 0 ? "#059669" : "#dc2626"} />
                  ))}
                  <LabelList
                    dataKey="revenueDeltaPct"
                    position="top"
                    formatter={(value) => {
                      const numeric = Number(value ?? 0);
                      return `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}%`;
                    }}
                    className="fill-slate-700 text-[10px]"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-border/60 bg-card p-3 xl:col-span-2 2xl:col-span-1">
          <div className="mb-2">
            <h4 className="text-sm font-semibold">{t("devReport.chartMix")}</h4>
            <p className="text-[11px] text-muted-foreground">{t("devReport.chartMixHint")}</p>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={mixData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={88}
                  innerRadius={48}
                  labelLine={false}
                  label={pieLabelRenderer}
                >
                  {mixData.map((d, i) => (
                    <Cell key={d.id} fill={mixColors[i % mixColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, _name, payload) => {
                    const numeric = Number(v ?? 0);
                    const pctVal = mixTotal > 0 ? (numeric / mixTotal) * 100 : 0;
                    const rowName =
                      payload && typeof payload === "object" && "payload" in payload
                        ? String((payload as { payload?: { name?: string } }).payload?.name ?? "")
                        : "";
                    return [`${nfCurrency(numeric, "EUR")} (${pctVal.toFixed(1)}%)`, rowName];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("devReport.marketplaceCardsHeading")}</h3>
        <p className="text-xs text-muted-foreground">{t("devReport.marketplaceCardsHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {channelRows.map((row) => {
          const revPct = pct(row.currentRevenue, row.previousRevenue);
          const netPct = pct(row.currentNet, row.previousNet);
          return (
            <article key={row.id} className="min-w-0 rounded-xl border border-border/70 bg-gradient-to-b from-card to-muted/20 p-3 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex h-6 w-16 items-center justify-start" aria-hidden>
                  <MarketplaceBrandImg
                    src={devReportChannelBrand(row.id as DevReportChannelId).logoSrc}
                    alt=""
                    className="max-h-6 max-w-full object-contain object-left"
                  />
                </span>
                <h3 className="text-sm font-semibold">{row.label}</h3>
              </div>
              <div className="space-y-2 text-xs [font-variant-numeric:tabular-nums]">
                <p className="flex items-center justify-between">
                  <span>Umsatz</span>
                  <span className="text-sm font-semibold">{nfCurrency(row.currentRevenue, row.currency)}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-muted-foreground">Entwicklung</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", revPct != null && revPct >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>
                    {fmtPct(revPct, intlTag)}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span>Einheiten</span>
                  <span className="font-medium">{nfInt.format(row.currentUnits)}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span>Netto</span>
                  <span className="font-medium">{nfCurrency(row.currentNet, row.currency)}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-muted-foreground">Netto-Delta</span>
                  <span className={cn("text-[11px] font-medium", toneClass(netPct))}>{fmtPct(netPct, intlTag)}</span>
                </p>
              </div>
            </article>
          );
        })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("devReport.articlesHeading")}</h3>
        <p className="text-xs text-muted-foreground">{t("devReport.articlesHint")}</p>
        {articlesLoading ? <p className="text-xs text-muted-foreground">{t("devReport.articlesLoading")}</p> : null}
        {articleScopeNotices.length > 0 ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-900">
            {articleScopeNotices.map((n) => (
              <p key={`${n.channelId}-${n.kind}`}>
                {n.channelId}: {n.kind}
                {n.detail ? ` - ${n.detail}` : ""}
              </p>
            ))}
          </div>
        ) : null}
        <DevelopmentReportArticleSummary
          channels={articleSummaryChannels}
          intlTag={intlTag}
          currency={articleSummaryCurrency}
          moverMetric={moverMetric}
          t={t}
        />
      </section>
    </div>
  );
}
