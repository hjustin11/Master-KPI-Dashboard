"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { ProductsData } from "@/shared/hooks/useMarketplaceProducts";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

const PIE_FILLS = ["#000000", "#4b5563", "#9ca3af", "#d1d5db", "#e5e7eb"];

// Simple category detection from product name
function detectCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("kratz") || lower.includes("scratching")) return "Kratzmöbel";
  if (lower.includes("toilette") || lower.includes("katzenklo") || lower.includes("klo") || lower.includes("selbstreinig")) return "Katzentoiletten";
  if (lower.includes("brunnen") || lower.includes("wasser") || lower.includes("fountain")) return "Wasserspender";
  if (lower.includes("napf") || lower.includes("futter") || lower.includes("feeder")) return "Futternapf";
  if (lower.includes("müll") || lower.includes("beutel") || lower.includes("waste")) return "Müllbeutel";
  if (lower.includes("treppe") || lower.includes("rampe") || lower.includes("stair")) return "Treppen";
  return "Sonstiges";
}

export function MarketplaceCategoryBreakdown({
  productsData,
  loading,
}: {
  slug: string;
  productsData: ProductsData | null;
  loading: boolean;
}) {
  const categories = useMemo(() => {
    if (!productsData) return [];
    const map = new Map<string, { revenue: number; products: number; prevRevenue: number }>();
    for (const p of productsData.products) {
      const cat = detectCategory(p.name);
      const entry = map.get(cat) ?? { revenue: 0, products: 0, prevRevenue: 0 };
      entry.revenue += p.revenueCurrent;
      entry.prevRevenue += p.revenuePrevious;
      entry.products += 1;
      map.set(cat, entry);
    }
    return [...map.entries()]
      .map(([name, d]) => ({
        name,
        revenue: Math.round(d.revenue),
        products: d.products,
        deltaPct: d.prevRevenue > 0 ? Math.round(((d.revenue - d.prevRevenue) / d.prevRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [productsData]);

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-card">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Kategorien</p>
        <div className="mt-4 h-48 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-card">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Kategorien</p>
        <p className="mt-4 text-sm text-gray-500">Keine Kategoriedaten verfügbar.</p>
      </div>
    );
  }

  const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0);

  return (
    <div className="rounded-lg border bg-white shadow-sm dark:bg-card">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Umsatz nach Kategorie</p>
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[200px_1fr]">
        {/* Donut */}
        <div className="flex items-center justify-center">
          <ResponsiveContainer width={180} height={180}>
            <PieChart>
              <Pie data={categories.slice(0, 5)} dataKey="revenue" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="none">
                {categories.slice(0, 5).map((_, i) => (
                  <Cell key={i} fill={PIE_FILLS[i % PIE_FILLS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatEur(Number(value ?? 0))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              <th className="pb-2 text-left">Kategorie</th>
              <th className="pb-2 text-right">Umsatz</th>
              <th className="pb-2 text-right">Anteil</th>
              <th className="pb-2 text-right">Δ</th>
              <th className="pb-2 text-right">Produkte</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={c.name} className="border-t border-gray-100 dark:border-gray-800">
                <td className="flex items-center gap-2 py-2 font-medium text-black dark:text-white">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: PIE_FILLS[i % PIE_FILLS.length] }} />
                  {c.name}
                </td>
                <td className="py-2 text-right tabular-nums text-black dark:text-white">{formatEur(c.revenue)}</td>
                <td className="py-2 text-right tabular-nums text-gray-500">{totalRevenue > 0 ? ((c.revenue / totalRevenue) * 100).toFixed(0) : 0} %</td>
                <td className="py-2 text-right">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    c.deltaPct > 0 ? "bg-black text-white dark:bg-white dark:text-black" : c.deltaPct < 0 ? "bg-gray-700 text-white dark:bg-gray-300 dark:text-black" : "bg-gray-200 text-black"
                  }`}>
                    {c.deltaPct > 0 ? "+" : ""}{c.deltaPct} %
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums text-gray-500">{c.products}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
