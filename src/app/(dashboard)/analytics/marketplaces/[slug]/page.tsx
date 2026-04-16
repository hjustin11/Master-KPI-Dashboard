"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMarketplaceBySlug } from "@/shared/lib/analytics-marketplaces";
import useMarketplaceDetail from "@/shared/hooks/useMarketplaceDetail";
import useMarketplaceProducts from "@/shared/hooks/useMarketplaceProducts";
import { MarketplaceDetailHeader } from "./components/MarketplaceDetailHeader";
import { MarketplaceExecutiveSummary } from "./components/MarketplaceExecutiveSummary";
import { MarketplaceHeroStage } from "./components/MarketplaceHeroStage";
import { MarketplaceInsightsStream } from "./components/MarketplaceInsightsStream";
import { MarketplaceTimeSeriesSection } from "./components/MarketplaceTimeSeriesSection";
import { MarketplaceProductBreakdown } from "./components/MarketplaceProductBreakdown";
import { MarketplaceCategoryBreakdown } from "./components/MarketplaceCategoryBreakdown";
import { MarketplaceComparisonPanel } from "./components/MarketplaceComparisonPanel";

export default function MarketplaceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const marketplace = getMarketplaceBySlug(slug);
  const { data, loading, error, refresh } = useMarketplaceDetail(slug);
  const { data: productsData, loading: productsLoading } = useMarketplaceProducts(slug);

  if (!marketplace) {
    return <div className="p-8 text-center text-gray-500">Marktplatz nicht gefunden.</div>;
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 p-4 sm:p-6">
      <Link
        href="/analytics/marketplaces"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-black dark:hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Zurück zur Übersicht
      </Link>

      {error && (
        <div className="rounded-lg border border-gray-300 bg-gray-100 p-4 text-sm text-black dark:border-gray-600 dark:bg-gray-800 dark:text-white">
          {error}
        </div>
      )}

      <MarketplaceDetailHeader slug={slug} data={data} loading={loading} onSync={refresh} />
      <MarketplaceExecutiveSummary slug={slug} data={data} products={productsData} loading={loading} />
      <MarketplaceHeroStage slug={slug} data={data} loading={loading} />
      <MarketplaceInsightsStream slug={slug} overview={data} products={productsData} loading={loading || productsLoading} />
      <MarketplaceTimeSeriesSection slug={slug} data={data} loading={loading} />
      <MarketplaceProductBreakdown slug={slug} data={productsData} loading={productsLoading} />
      <MarketplaceCategoryBreakdown slug={slug} productsData={productsData} loading={productsLoading} />
      <MarketplaceComparisonPanel slug={slug} data={data} loading={loading} />
    </div>
  );
}
