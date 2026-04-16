"use client";

import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { MarketplaceOverviewData } from "@/shared/hooks/useMarketplaceDetail";

type MetricKey = "amount" | "orders" | "units";

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "amount", label: "Umsatz (€)", color: "#000000" },
  { key: "orders", label: "Bestellungen", color: "#6b7280" },
  { key: "units", label: "Einheiten", color: "#9ca3af" },
];

function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

export function MarketplaceTimeSeriesSection({
  data,
  loading,
}: {
  slug: string;
  data: MarketplaceOverviewData | null;
  loading: boolean;
}) {
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(new Set(["amount"]));
  const [showPrevious, setShowPrevious] = useState(true);

  const chartData = useMemo(() => {
    if (!data?.points) return [];
    return (data.points as Array<Record<string, unknown>>).map((p, i) => {
      const prev = (data.previousPoints ?? [])[i] as Record<string, unknown> | undefined;
      const row: Record<string, unknown> = {
        date: fmtDateShort(String(p.date ?? "")),
        amount: Number(p.amount ?? 0),
        orders: Number(p.orders ?? 0),
        units: Number(p.units ?? 0),
      };
      if (showPrevious && prev) {
        row.prevAmount = Number(prev.amount ?? 0);
        row.prevOrders = Number(prev.orders ?? 0);
      }
      return row;
    });
  }, [data, showPrevious]);

  function toggleMetric(key: MetricKey) {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  }

  if (loading || !data) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-card">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Zeitverlauf</p>
        <div className="mt-4 h-64 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-card">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Zeitverlauf</p>
        <p className="mt-4 text-sm text-gray-500">Keine Zeitreihendaten für diesen Zeitraum.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Entwicklung im Zeitverlauf</p>
        <div className="flex items-center gap-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${
                activeMetrics.has(m.key)
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              {m.label}
            </button>
          ))}
          <button
            onClick={() => setShowPrevious(!showPrevious)}
            className={`ml-2 rounded px-2 py-1 text-[10px] font-bold transition-colors ${
              showPrevious
                ? "bg-gray-700 text-white dark:bg-gray-300 dark:text-black"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800"
            }`}
          >
            Vorperiode
          </button>
        </div>
      </div>

      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              width={45}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
              formatter={(value, name) => [
                String(name).includes("mount") || name === "amount" || name === "prevAmount"
                  ? Number(value ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" })
                  : Number(value ?? 0).toLocaleString("de-DE"),
                String(name).startsWith("prev") ? "Vorperiode" : String(name),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {METRICS.filter((m) => activeMetrics.has(m.key)).map((m) => (
              <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            ))}
            {showPrevious && activeMetrics.has("amount") && (
              <Line type="monotone" dataKey="prevAmount" name="Vorperiode" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            )}
            {showPrevious && activeMetrics.has("orders") && (
              <Line type="monotone" dataKey="prevOrders" name="Vorper. Best." stroke="#e5e7eb" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
