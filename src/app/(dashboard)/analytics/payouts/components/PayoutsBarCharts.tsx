"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import type { PayoutTotals } from "@/shared/lib/payouts/payoutTypes";

function formatEurShort(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${Math.round(n)}€`;
}

const PIE_COLORS = ["#00a862", "#dc2626", "#f59e0b", "#6366f1", "#94a3b8"];

export function PayoutsBarCharts({
  totals,
  previousTotals,
  loading,
}: {
  totals: PayoutTotals | null;
  previousTotals: PayoutTotals | null;
  loading: boolean;
}) {
  if (loading || !totals || !previousTotals) return null;

  const mainData = [
    { name: "Umsatz", prev: previousTotals.grossSales, curr: totals.grossSales },
    { name: "Auszahlung", prev: previousTotals.netPayout, curr: totals.netPayout },
    { name: "Gebühren", prev: previousTotals.totalFees, curr: totals.totalFees },
    { name: "Werbung", prev: Math.abs(previousTotals.advertisingFees), curr: Math.abs(totals.advertisingFees) },
    { name: "Retouren", prev: Math.abs(previousTotals.refundsAmount), curr: Math.abs(totals.refundsAmount) },
  ];

  // Pie chart: Aufteilung des Bruttoumsatzes
  const pieData = totals.grossSales > 0
    ? [
        { name: "Auszahlung", value: Math.max(0, totals.netPayout) },
        { name: "Gebühren", value: totals.totalFees },
        { name: "Werbung", value: Math.abs(totals.advertisingFees) },
        { name: "Retouren", value: Math.abs(totals.refundsAmount) },
        { name: "Sonstiges", value: Math.max(0, totals.grossSales - totals.netPayout - totals.totalFees - Math.abs(totals.advertisingFees) - Math.abs(totals.refundsAmount)) },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Absolute values side-by-side */}
      <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-card">
        <h2 className="mb-1 text-base font-bold text-black dark:text-white">
          Hauptkennzahlen im Vergleich
        </h2>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Grau = Vorperiode, Rot = aktuelle Periode
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={mainData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={formatEurShort} width={55} />
            <Tooltip
              formatter={(value) =>
                Number(value ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })
              }
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="prev" name="Vorperiode" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="curr" name="Aktuell" fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie: Umsatzaufteilung */}
      <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-card">
        <h2 className="mb-1 text-base font-bold text-black dark:text-white">
          Umsatzaufteilung — Aktuelle Periode
        </h2>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Wohin fließt jeder Euro vom Bruttoumsatz?
        </p>
        {pieData.length > 0 ? (
          <div className="flex items-center justify-center gap-6">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  dataKey="value"
                  paddingAngle={2}
                  stroke="none"
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) =>
                    Number(value ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
                  }
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {pieData.map((d, idx) => {
                const pct = totals.grossSales > 0 ? ((d.value / totals.grossSales) * 100).toFixed(1) : "0";
                return (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                    />
                    <span className="font-medium text-black dark:text-white">{d.name}</span>
                    <span className="ml-auto tabular-nums text-gray-500 dark:text-gray-400">{pct} %</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-gray-500">Keine Umsatzdaten vorhanden.</p>
        )}
      </div>
    </div>
  );
}
