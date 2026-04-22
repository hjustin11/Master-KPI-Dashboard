"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { MarketplaceOverviewData } from "@/shared/hooks/useMarketplaceDetail";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function CountUp({ target, duration = 800, format }: { target: number; duration?: number; format: (n: number) => string }) {
  const [current, setCurrent] = useState(target === 0 ? 0 : 0);
  useEffect(() => {
    if (target === 0) {
      const id = requestAnimationFrame(() => setCurrent(0));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return <>{format(current)}</>;
}

type KpiDef = {
  label: string;
  value: (d: MarketplaceOverviewData) => number;
  format: (n: number) => string;
  delta: (d: MarketplaceOverviewData) => number | null;
  deltaSuffix: string;
  sparklineKey: "amount" | "orders" | "units";
};

const KPIS: KpiDef[] = [
  { label: "Bruttoumsatz", value: (d) => d.totals.grossSales, format: formatEur, delta: (d) => d.deltas.grossSales, deltaSuffix: " %", sparklineKey: "amount" },
  { label: "Bestellungen", value: (d) => d.totals.orders, format: (n) => Math.round(n).toLocaleString("de-DE"), delta: (d) => d.deltas.orders, deltaSuffix: " %", sparklineKey: "orders" },
  { label: "Ø Bestellwert", value: (d) => d.totals.avgOrderValue, format: formatEur, delta: (d) => d.deltas.avgOrderValue, deltaSuffix: " %", sparklineKey: "amount" },
  { label: "Retourenquote", value: (d) => d.totals.returnRate * 100, format: (n) => `${n.toFixed(1)} %`, delta: () => null, deltaSuffix: " pp", sparklineKey: "amount" },
  { label: "Netto", value: (d) => d.totals.netPayout, format: formatEur, delta: () => null, deltaSuffix: " %", sparklineKey: "amount" },
];

export function MarketplaceHeroStage({
  data,
  loading,
}: {
  slug: string;
  data: MarketplaceOverviewData | null;
  loading: boolean;
}) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {KPIS.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border bg-white p-4 shadow-sm dark:bg-card">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{kpi.label}</p>
            <div className="mt-2 h-7 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
    );
  }

  const sparkData = (data.points ?? []).slice(-14);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {KPIS.map((kpi) => {
        const val = kpi.value(data);
        const delta = kpi.delta(data);
        return (
          <div key={kpi.label} className="rounded-lg border bg-white p-4 shadow-sm dark:bg-card">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{kpi.label}</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-black dark:text-white">
              <CountUp target={val} format={kpi.format} />
            </p>
            {delta !== null && (
              <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                delta > 0 ? "bg-black text-white dark:bg-white dark:text-black" : "bg-gray-700 text-white dark:bg-gray-300 dark:text-black"
              }`}>
                {delta > 0 ? "▲ +" : "▼ "}{delta.toFixed(1)}{kpi.deltaSuffix}
              </span>
            )}
            {sparkData.length > 2 && (
              <div className="mt-2 h-8">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData}>
                    <Line type="monotone" dataKey={kpi.sparklineKey} stroke="#000" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
