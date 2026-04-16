"use client";

import type { MarketplaceOverviewData } from "@/shared/hooks/useMarketplaceDetail";
import type { ProductsData } from "@/shared/hooks/useMarketplaceProducts";
import { generateNarrative } from "@/shared/lib/marketplaceDetail/marketplaceNarrativeGenerator";

export function MarketplaceExecutiveSummary({
  data,
  products,
  loading,
}: {
  slug: string;
  data: MarketplaceOverviewData | null;
  products?: ProductsData | null;
  loading: boolean;
}) {
  if (loading || !data) {
    return (
      <div className="rounded-lg border bg-gray-50 p-6 dark:bg-card">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  const narrative = generateNarrative(data, products);
  const trend = data.deltas.grossSales;
  const icon = trend === null ? "📊" : trend > 5 ? "📈" : trend < -5 ? "📉" : "⚡";

  return (
    <div className="rounded-lg border bg-gray-50 p-6 dark:bg-card">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Executive Summary</p>
      <p className="mt-3 text-base leading-relaxed text-black dark:text-white">
        <span className="mr-2 text-lg">{icon}</span>
        {narrative}
      </p>
    </div>
  );
}
