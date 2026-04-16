"use client";

import { useState } from "react";
import type { ProductRow, ProductsData, ProductStatus } from "@/shared/hooks/useMarketplaceProducts";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

const STATUS_LABEL: Record<ProductStatus, string> = {
  bestseller: "Bestseller",
  newcomer: "Newcomer",
  losing_ground: "Eingebrochen",
  reviving: "Comeback",
  sunset: "Auslauf",
  stable: "Stabil",
};

const TABS: { key: ProductStatus | "all"; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "bestseller", label: "Bestseller" },
  { key: "newcomer", label: "Newcomer" },
  { key: "losing_ground", label: "Verlierer" },
  { key: "reviving", label: "Comebacks" },
  { key: "sunset", label: "Auslauf" },
];

export function MarketplaceProductBreakdown({
  data,
  loading,
}: {
  slug: string;
  data: ProductsData | null;
  loading: boolean;
}) {
  const [activeTab, setActiveTab] = useState<ProductStatus | "all">("all");

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-card">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Produkt-Performance</p>
        <div className="mt-4 h-48 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (!data || data.products.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-card">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Produkt-Performance</p>
        <p className="mt-4 text-sm text-gray-500">Keine Produktdaten für diesen Zeitraum.</p>
      </div>
    );
  }

  const filtered = activeTab === "all" ? data.products : data.products.filter((p) => p.status === activeTab);

  // Movement cards
  const newcomers = data.products.filter((p) => p.status === "newcomer").slice(0, 3);
  const losers = data.products.filter((p) => p.status === "losing_ground").slice(0, 3);
  const revivals = data.products.filter((p) => p.status === "reviving").slice(0, 3);
  const sunsets = data.products.filter((p) => p.status === "sunset").slice(0, 3);

  const movements = [
    { title: "Newcomer", items: newcomers, total: newcomers.reduce((s, p) => s + p.revenueCurrent, 0) },
    { title: "Eingebrochen", items: losers, total: losers.reduce((s, p) => s + (p.revenuePrevious - p.revenueCurrent), 0) },
    { title: "Comeback", items: revivals, total: revivals.reduce((s, p) => s + p.revenueCurrent, 0) },
    { title: "Auslauf", items: sunsets, total: sunsets.reduce((s, p) => s + p.revenuePrevious, 0) },
  ].filter((m) => m.items.length > 0);

  return (
    <div className="space-y-4">
      {/* Movement cards */}
      {movements.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {movements.map((m) => (
            <div
              key={m.title}
              className="cursor-pointer rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:bg-card"
              onClick={() => {
                const key = m.title === "Newcomer" ? "newcomer" : m.title === "Eingebrochen" ? "losing_ground" : m.title === "Comeback" ? "reviving" : "sunset";
                setActiveTab(key as ProductStatus);
              }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{m.title}</p>
              <div className="mt-2 space-y-1">
                {m.items.map((p) => (
                  <p key={p.sku} className="truncate text-xs text-black dark:text-white">{p.name || p.sku}</p>
                ))}
              </div>
              <p className="mt-2 text-sm font-bold tabular-nums text-black dark:text-white">
                {m.title === "Eingebrochen" ? "−" : "+"}{formatEur(m.total)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Main table */}
      <div className="rounded-lg border bg-white shadow-sm dark:bg-card">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Produkt-Performance</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded px-2.5 py-1 text-[10px] font-bold transition-colors ${
                  activeTab === tab.key
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">#</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Produkt</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Einh.</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Umsatz</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Vorperiode</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Δ</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 20).map((p, i) => (
                <ProductTableRow key={p.sku} product={p} rank={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductTableRow({ product: p, rank }: { product: ProductRow; rank: number }) {
  const bgCls = p.status === "losing_ground" || p.status === "sunset"
    ? "bg-gray-100 dark:bg-gray-800/40"
    : p.status === "newcomer" || p.status === "reviving"
      ? "bg-gray-50 dark:bg-gray-800/20"
      : "";

  return (
    <tr className={`border-b border-gray-100 dark:border-gray-800 ${bgCls}`}>
      <td className="px-4 py-2 text-xs tabular-nums text-gray-400">{rank}</td>
      <td className="max-w-[240px] truncate px-4 py-2 font-medium text-black dark:text-white" title={p.name}>{p.name || p.sku}</td>
      <td className="px-4 py-2 text-right tabular-nums text-black dark:text-white">{p.ordersCurrent}</td>
      <td className="px-4 py-2 text-right tabular-nums font-semibold text-black dark:text-white">{formatEur(p.revenueCurrent)}</td>
      <td className="px-4 py-2 text-right tabular-nums text-gray-400">{formatEur(p.revenuePrevious)}</td>
      <td className="px-4 py-2 text-right">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
          p.deltaPct > 0 ? "bg-black text-white dark:bg-white dark:text-black" : p.deltaPct < 0 ? "bg-gray-700 text-white dark:bg-gray-300 dark:text-black" : "bg-gray-200 text-black"
        }`}>
          {p.deltaPct > 0 ? "+" : ""}{p.deltaPct.toFixed(1)} %
        </span>
      </td>
      <td className="px-4 py-2">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {STATUS_LABEL[p.status]}
        </span>
      </td>
    </tr>
  );
}
