"use client";

import { useMemo } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import type { MarketplaceOverviewData } from "@/shared/hooks/useMarketplaceDetail";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

type MetricRow = {
  label: string;
  current: number;
  previous: number;
  currentFmt: string;
  previousFmt: string;
  /** 0-100 normalized for radar */
  currentNorm: number;
  previousNorm: number;
};

function buildMetrics(data: MarketplaceOverviewData): MetricRow[] {
  const t = data.totals;
  const p = data.previous;
  const rows: MetricRow[] = [
    { label: "Umsatz", current: t.grossSales, previous: p.grossSales, currentFmt: formatEur(t.grossSales), previousFmt: formatEur(p.grossSales), currentNorm: 0, previousNorm: 0 },
    { label: "Bestellungen", current: t.orders, previous: p.orders, currentFmt: String(t.orders), previousFmt: String(p.orders), currentNorm: 0, previousNorm: 0 },
    { label: "AOV", current: t.avgOrderValue, previous: p.avgOrderValue, currentFmt: formatEur(t.avgOrderValue), previousFmt: formatEur(p.avgOrderValue), currentNorm: 0, previousNorm: 0 },
    { label: "Retouren", current: t.returnRate * 100, previous: 0, currentFmt: `${(t.returnRate * 100).toFixed(1)} %`, previousFmt: "—", currentNorm: 0, previousNorm: 0 },
    { label: "Werbekosten", current: t.adSpend, previous: 0, currentFmt: formatEur(t.adSpend), previousFmt: "—", currentNorm: 0, previousNorm: 0 },
    { label: "Netto", current: t.netPayout, previous: 0, currentFmt: formatEur(t.netPayout), previousFmt: "—", currentNorm: 0, previousNorm: 0 },
  ];

  // Normalize to 0-100 for radar
  for (const r of rows) {
    const max = Math.max(Math.abs(r.current), Math.abs(r.previous), 1);
    r.currentNorm = Math.round((Math.abs(r.current) / max) * 100);
    r.previousNorm = Math.round((Math.abs(r.previous) / max) * 100);
  }

  return rows;
}

function generateFazit(data: MarketplaceOverviewData): string {
  const { deltas } = data;
  const parts: string[] = [];

  if (deltas.grossSales !== null) {
    if (deltas.grossSales < -10) {
      parts.push(`Der Umsatz ist um ${Math.abs(deltas.grossSales).toFixed(0)} % zurückgegangen.`);
    } else if (deltas.grossSales > 10) {
      parts.push(`Der Umsatz ist um +${deltas.grossSales.toFixed(0)} % gewachsen.`);
    } else {
      parts.push("Der Umsatz ist stabil geblieben.");
    }
  }

  if (deltas.orders !== null && deltas.avgOrderValue !== null) {
    if (deltas.orders < -10 && deltas.avgOrderValue < -10) {
      parts.push("Sowohl Bestellanzahl als auch Bestellwert sind gefallen — doppelter Effekt.");
    } else if (deltas.avgOrderValue < -15) {
      parts.push("Der durchschnittliche Bestellwert ist deutlich gesunken — Kunden kaufen günstiger.");
    } else if (deltas.orders < -15) {
      parts.push("Die Bestellanzahl ist stark rückläufig.");
    }
  }

  return parts.join(" ") || "Keine signifikanten Veränderungen zur Vorperiode.";
}

export function MarketplaceComparisonPanel({
  data,
  loading,
}: {
  slug: string;
  data: MarketplaceOverviewData | null;
  loading: boolean;
}) {
  const metrics = useMemo(() => (data ? buildMetrics(data) : []), [data]);
  const radarData = useMemo(() => metrics.map((m) => ({
    metric: m.label,
    current: m.currentNorm,
    previous: m.previousNorm,
  })), [metrics]);
  const fazit = useMemo(() => (data ? generateFazit(data) : ""), [data]);

  if (loading || !data) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-card">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Vergleich mit Vorperiode</p>
        <div className="mt-4 h-48 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm dark:bg-card">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Vergleich mit Vorperiode</p>
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-2">
        {/* Left: metric bars */}
        <div className="space-y-3">
          {metrics.map((m) => {
            const max = Math.max(m.current, m.previous, 1);
            const currPct = (m.current / max) * 100;
            const prevPct = (m.previous / max) * 100;
            return (
              <div key={m.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-black dark:text-white">{m.label}</span>
                  <span className="tabular-nums text-gray-500">{m.currentFmt}</span>
                </div>
                <div className="mt-1 flex gap-1">
                  <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700" style={{ width: "100%" }}>
                    <div className="h-full rounded-full bg-black dark:bg-white" style={{ width: `${currPct}%` }} />
                  </div>
                </div>
                {m.previous > 0 && (
                  <div className="mt-0.5 flex gap-1">
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800" style={{ width: "100%" }}>
                      <div className="h-full rounded-full bg-gray-400 dark:bg-gray-500" style={{ width: `${prevPct}%` }} />
                    </div>
                  </div>
                )}
                {m.previous > 0 && (
                  <p className="mt-0.5 text-[10px] text-gray-400">Vorperiode: {m.previousFmt}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: radar chart */}
        <div className="flex flex-col items-center justify-center">
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Radar name="Aktuell" dataKey="current" stroke="#000" fill="#000" fillOpacity={0.15} strokeWidth={2} />
              <Radar name="Vorperiode" dataKey="previous" stroke="#9ca3af" fill="#9ca3af" fillOpacity={0.08} strokeWidth={1.5} strokeDasharray="4 4" />
            </RadarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-black dark:bg-white" /> Aktuell</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-gray-400" /> Vorperiode</span>
          </div>
        </div>
      </div>

      {/* Fazit */}
      <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-700">
        <p className="text-sm text-black dark:text-white">{fazit}</p>
      </div>
    </div>
  );
}
