"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";
import { MarketplacePriceParitySection } from "./MarketplacePriceParitySection";
import { bandsForTotalChart } from "./marketplaceActionBands";
import { PromotionDealsDialog } from "./PromotionDealsDialog";
import { usePromotionDeals } from "./usePromotionDeals";
import { DevelopmentReportDialog } from "./DevelopmentReportDialog";
import { useTranslation } from "@/i18n/I18nProvider";
import { getDateFnsLocale, intlLocaleTag } from "@/i18n/locale-formatting";
import {
  WIKIMEDIA_FRESSNAPF_LOGO_2023_SVG,
  WIKIMEDIA_MEDIAMARKT_SATURN_LOGO_SVG,
  WIKIMEDIA_SHOPIFY_LOGO_2018_SVG,
  WIKIMEDIA_ZOOPLUS_LOGO_PNG,
} from "@/shared/lib/dashboardUi";
import {
  PLACEHOLDER,
  type TrendDirection,
  MARKETPLACE_TILE_GRID_CLASS,
} from "@/shared/lib/marketplace-sales-types";
import { formatTrendPct } from "@/shared/lib/marketplace-analytics-utils";
import { MarketplaceTile } from "./components/MarketplaceTile";
import { PlaceholderTile } from "./components/MarketplacePlaceholderTile";
import { TotalMarketplacesKpiStrip } from "./components/TotalMarketplacesKpiStrip";
import { MarketplaceNetSummarySection } from "./components/MarketplaceNetSummarySection";
import { PdfReportDialog } from "./components/PdfReportDialog";
import { MarketplaceDetailDialog } from "./components/MarketplaceDetailDialog";
import useMarketplacePeriod from "@/shared/hooks/useMarketplacePeriod";
import useMarketplaceDetailNavigation from "@/shared/hooks/useMarketplaceDetailNavigation";
import usePdfReportDialog from "@/shared/hooks/usePdfReportDialog";
import useMarketplaceTotals from "@/shared/hooks/useMarketplaceTotals";
import useMarketplaceReportRows from "@/shared/hooks/useMarketplaceReportRows";
import useMarketplaceSalesLoader from "@/shared/hooks/useMarketplaceSalesLoader";

function AnalyticsMarketplacesPage() {
  const { t, locale } = useTranslation();
  const dfLocale = getDateFnsLocale(locale);
  const intlTag = intlLocaleTag(locale);

  const { period, setPeriod, periodRef, forceUnblockTotalStrip } = useMarketplacePeriod();
  const { states: salesStates } = useMarketplaceSalesLoader({
    periodFrom: period.from,
    periodTo: period.to,
    periodRef,
    t,
  });
  const amazonData = salesStates.amazon.data;
  const amazonLoading = salesStates.amazon.loading;
  const amazonError = salesStates.amazon.error;
  const amazonBackgroundSyncing = salesStates.amazon.backgroundSyncing;
  const ebayData = salesStates.ebay.data;
  const ebayLoading = salesStates.ebay.loading;
  const ebayError = salesStates.ebay.error;
  const ebayBackgroundSyncing = salesStates.ebay.backgroundSyncing;
  const ottoData = salesStates.otto.data;
  const ottoLoading = salesStates.otto.loading;
  const ottoError = salesStates.otto.error;
  const ottoBackgroundSyncing = salesStates.otto.backgroundSyncing;
  const kauflandData = salesStates.kaufland.data;
  const kauflandLoading = salesStates.kaufland.loading;
  const kauflandError = salesStates.kaufland.error;
  const kauflandBackgroundSyncing = salesStates.kaufland.backgroundSyncing;
  const fressnapfData = salesStates.fressnapf.data;
  const fressnapfLoading = salesStates.fressnapf.loading;
  const fressnapfError = salesStates.fressnapf.error;
  const fressnapfBackgroundSyncing = salesStates.fressnapf.backgroundSyncing;
  const mmsData = salesStates.mms.data;
  const mmsLoading = salesStates.mms.loading;
  const mmsError = salesStates.mms.error;
  const mmsBackgroundSyncing = salesStates.mms.backgroundSyncing;
  const zooplusData = salesStates.zooplus.data;
  const zooplusLoading = salesStates.zooplus.loading;
  const zooplusError = salesStates.zooplus.error;
  const zooplusBackgroundSyncing = salesStates.zooplus.backgroundSyncing;
  const tiktokData = salesStates.tiktok.data;
  const tiktokLoading = salesStates.tiktok.loading;
  const tiktokError = salesStates.tiktok.error;
  const tiktokBackgroundSyncing = salesStates.tiktok.backgroundSyncing;
  const shopifyData = salesStates.shopify.data;
  const shopifyLoading = salesStates.shopify.loading;
  const shopifyError = salesStates.shopify.error;
  const shopifyBackgroundSyncing = salesStates.shopify.backgroundSyncing;


  const summary = amazonData?.summary;
  const prev = amazonData?.previousSummary;
  const trend = summary
    ? formatTrendPct(
        amazonData?.revenueDeltaPct,
        prev?.salesAmount ?? 0,
        summary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const ebaySummary = ebayData?.summary;
  const ebayPrev = ebayData?.previousSummary;
  const ebayTrend = ebaySummary
    ? formatTrendPct(
        ebayData?.revenueDeltaPct,
        ebayPrev?.salesAmount ?? 0,
        ebaySummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const ottoSummary = ottoData?.summary;
  const ottoPrev = ottoData?.previousSummary;
  const ottoTrend = ottoSummary
    ? formatTrendPct(
        ottoData?.revenueDeltaPct,
        ottoPrev?.salesAmount ?? 0,
        ottoSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const kauflandSummary = kauflandData?.summary;
  const kauflandPrev = kauflandData?.previousSummary;
  const kauflandTrend = kauflandSummary
    ? formatTrendPct(
        kauflandData?.revenueDeltaPct,
        kauflandPrev?.salesAmount ?? 0,
        kauflandSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const fressnapfSummary = fressnapfData?.summary;
  const fressnapfPrev = fressnapfData?.previousSummary;
  const fressnapfTrend = fressnapfSummary
    ? formatTrendPct(
        fressnapfData?.revenueDeltaPct,
        fressnapfPrev?.salesAmount ?? 0,
        fressnapfSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const mmsSummary = mmsData?.summary;
  const mmsPrev = mmsData?.previousSummary;
  const mmsTrend = mmsSummary
    ? formatTrendPct(
        mmsData?.revenueDeltaPct,
        mmsPrev?.salesAmount ?? 0,
        mmsSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const zooplusSummary = zooplusData?.summary;
  const zooplusPrev = zooplusData?.previousSummary;
  const zooplusTrend = zooplusSummary
    ? formatTrendPct(
        zooplusData?.revenueDeltaPct,
        zooplusPrev?.salesAmount ?? 0,
        zooplusSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const tiktokSummary = tiktokData?.summary;
  const tiktokPrev = tiktokData?.previousSummary;
  const tiktokTrend = tiktokSummary
    ? formatTrendPct(
        tiktokData?.revenueDeltaPct,
        tiktokPrev?.salesAmount ?? 0,
        tiktokSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const shopifySummary = shopifyData?.summary;
  const shopifyPrev = shopifyData?.previousSummary;
  const shopifyTrend = shopifySummary
    ? formatTrendPct(
        shopifyData?.revenueDeltaPct,
        shopifyPrev?.salesAmount ?? 0,
        shopifySummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const marketplaceDataMap = useMemo(
    () => ({
      amazon: amazonData,
      ebay: ebayData,
      otto: ottoData,
      kaufland: kauflandData,
      fressnapf: fressnapfData,
      mms: mmsData,
      zooplus: zooplusData,
      tiktok: tiktokData,
      shopify: shopifyData,
    }),
    [amazonData, ebayData, ottoData, kauflandData, fressnapfData, mmsData, zooplusData, tiktokData, shopifyData]
  );
  const marketplaceLoadingMap = useMemo(
    () => ({
      amazon: amazonLoading,
      ebay: ebayLoading,
      otto: ottoLoading,
      kaufland: kauflandLoading,
      fressnapf: fressnapfLoading,
      mms: mmsLoading,
      zooplus: zooplusLoading,
      tiktok: tiktokLoading,
      shopify: shopifyLoading,
    }),
    [amazonLoading, ebayLoading, ottoLoading, kauflandLoading, fressnapfLoading, mmsLoading, zooplusLoading, tiktokLoading, shopifyLoading]
  );
  const marketplaceBackgroundSyncMap = useMemo(
    () => ({
      amazon: amazonBackgroundSyncing,
      ebay: ebayBackgroundSyncing,
      otto: ottoBackgroundSyncing,
      kaufland: kauflandBackgroundSyncing,
      fressnapf: fressnapfBackgroundSyncing,
      mms: mmsBackgroundSyncing,
      zooplus: zooplusBackgroundSyncing,
      tiktok: tiktokBackgroundSyncing,
      shopify: shopifyBackgroundSyncing,
    }),
    [amazonBackgroundSyncing, ebayBackgroundSyncing, ottoBackgroundSyncing, kauflandBackgroundSyncing, fressnapfBackgroundSyncing, mmsBackgroundSyncing, zooplusBackgroundSyncing, tiktokBackgroundSyncing, shopifyBackgroundSyncing]
  );

  const {
    totals,
    totalStripBlocking,
    stripBackgroundSyncing,
    revenueChartCurrency,
    revenueLineSeries,
    totalChartDailyOrdersAndPrev,
    periodKpis,
  } = useMarketplaceTotals({
    data: marketplaceDataMap,
    loading: marketplaceLoadingMap,
    backgroundSyncing: marketplaceBackgroundSyncMap,
    periodFrom: period.from,
    periodTo: period.to,
    forceUnblockTotalStrip,
    dfLocale,
    t,
  });

  const { reportRows, netSummary } = useMarketplaceReportRows({
    data: marketplaceDataMap,
    totals,
  });

  const { detailOpen, setDetailOpen, detailIndex, stepDetail, openDetailAt } =
    useMarketplaceDetailNavigation();
  const [promotionsOpen, setPromotionsOpen] = useState(false);
  const [devReportOpen, setDevReportOpen] = useState(false);
  const { deals: promotionDeals, persist: persistPromotionDeals, remoteError: promotionRemoteError } =
    usePromotionDeals();
  const {
    reportOpen,
    setReportOpen,
    reportMode,
    setReportMode,
    reportMarketplaceId,
    setReportMarketplaceId,
    reportSelectedIds,
    setReportSelectedIds,
    activeReportRows,
    printReport,
  } = usePdfReportDialog({
    reportRows,
    periodFrom: period.from,
    periodTo: period.to,
    intlTag,
  });

  const totalChartBands = useMemo(() => bandsForTotalChart(promotionDeals), [promotionDeals]);

  return (
    <div className="space-y-4 text-sm leading-snug">
      <TotalMarketplacesKpiStrip
        loading={totalStripBlocking}
        totals={totals}
        revenueLineSeries={revenueLineSeries}
        revenueChartCurrency={revenueChartCurrency}
        totalChartDailyOrders={totalChartDailyOrdersAndPrev.dailyOrders}
        totalChartPreviousRevenue={totalChartDailyOrdersAndPrev.previousRevenue}
        totalChartBands={totalChartBands}
        periodFrom={period.from}
        periodTo={period.to}
        onPeriodChange={(from, to) => setPeriod({ from, to })}
        onOpenPromotionDeals={() => setPromotionsOpen(true)}
        onOpenReport={() => setReportOpen(true)}
        onOpenDevReport={() => setDevReportOpen(true)}
        backgroundSyncing={stripBackgroundSyncing}
        dfLocale={dfLocale}
        intlTag={intlTag}
        t={t}
      />
      <MarketplaceNetSummarySection netSummary={netSummary} intlTag={intlTag} />
      <MarketplaceDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        index={detailIndex}
        onStep={stepDetail}
        periodFrom={period.from}
        periodTo={period.to}
        amazonLoading={amazonLoading}
        amazonError={amazonError}
        amazonSummary={summary}
        amazonPreviousSummary={prev}
        amazonTrend={trend}
        amazonPoints={amazonData?.points ?? []}
        amazonPreviousPoints={amazonData?.previousPoints}
        ebayLoading={ebayLoading}
        ebayError={ebayError}
        ebaySummary={ebaySummary}
        ebayPreviousSummary={ebayPrev}
        ebayTrend={ebayTrend}
        ebayPoints={ebayData?.points ?? []}
        ebayPreviousPoints={ebayData?.previousPoints}
        ottoLoading={ottoLoading}
        ottoError={ottoError}
        ottoSummary={ottoSummary}
        ottoPreviousSummary={ottoPrev}
        ottoTrend={ottoTrend}
        ottoPoints={ottoData?.points ?? []}
        ottoPreviousPoints={ottoData?.previousPoints}
        kauflandLoading={kauflandLoading}
        kauflandError={kauflandError}
        kauflandSummary={kauflandSummary}
        kauflandPreviousSummary={kauflandPrev}
        kauflandTrend={kauflandTrend}
        kauflandPoints={kauflandData?.points ?? []}
        kauflandPreviousPoints={kauflandData?.previousPoints}
        fressnapfLoading={fressnapfLoading}
        fressnapfError={fressnapfError}
        fressnapfSummary={fressnapfSummary}
        fressnapfPreviousSummary={fressnapfPrev}
        fressnapfTrend={fressnapfTrend}
        fressnapfPoints={fressnapfData?.points ?? []}
        fressnapfPreviousPoints={fressnapfData?.previousPoints}
        mmsLoading={mmsLoading}
        mmsError={mmsError}
        mmsSummary={mmsSummary}
        mmsPreviousSummary={mmsPrev}
        mmsTrend={mmsTrend}
        mmsPoints={mmsData?.points ?? []}
        mmsPreviousPoints={mmsData?.previousPoints}
        zooplusLoading={zooplusLoading}
        zooplusError={zooplusError}
        zooplusSummary={zooplusSummary}
        zooplusPreviousSummary={zooplusPrev}
        zooplusTrend={zooplusTrend}
        zooplusPoints={zooplusData?.points ?? []}
        zooplusPreviousPoints={zooplusData?.previousPoints}
        tiktokLoading={tiktokLoading}
        tiktokError={tiktokError}
        tiktokSummary={tiktokSummary}
        tiktokPreviousSummary={tiktokPrev}
        tiktokTrend={tiktokTrend}
        tiktokPoints={tiktokData?.points ?? []}
        tiktokPreviousPoints={tiktokData?.previousPoints}
        shopifyLoading={shopifyLoading}
        shopifyError={shopifyError}
        shopifySummary={shopifySummary}
        shopifyPreviousSummary={shopifyPrev}
        shopifyTrend={shopifyTrend}
        shopifyPoints={shopifyData?.points ?? []}
        shopifyPreviousPoints={shopifyData?.previousPoints}
        promotionDeals={promotionDeals}
        periodKpis={periodKpis}
        reportRows={reportRows}
        intlTag={intlTag}
        dfLocale={dfLocale}
        t={t}
      />

      <PromotionDealsDialog
        open={promotionsOpen}
        onOpenChange={setPromotionsOpen}
        deals={promotionDeals}
        onPersist={persistPromotionDeals}
        remoteError={promotionRemoteError}
      />
      <DevelopmentReportDialog
        open={devReportOpen}
        onOpenChange={setDevReportOpen}
        initialFrom={period.from}
        initialTo={period.to}
        intlTag={intlTag}
        dfLocale={dfLocale}
        t={t}
      />
      <PdfReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        reportMode={reportMode}
        onReportModeChange={setReportMode}
        reportMarketplaceId={reportMarketplaceId}
        onReportMarketplaceIdChange={setReportMarketplaceId}
        reportSelectedIds={reportSelectedIds}
        onReportSelectedIdsChange={setReportSelectedIds}
        reportRows={reportRows}
        activeReportRows={activeReportRows}
        periodFrom={period.from}
        periodTo={period.to}
        intlTag={intlTag}
        onPrint={printReport}
      />

      <div className={MARKETPLACE_TILE_GRID_CLASS}>
        <MarketplaceTile
          label="Amazon"
          logoSrc="/brand/amazon-logo-current.png"
          logoPreset="amazon"
          summary={summary}
          previousSummary={prev}
          trend={trend}
          periodKpis={periodKpis}
          intlTag={intlTag}
          loading={amazonLoading}
          error={amazonError}
          onOpenDetail={() => openDetailAt("amazon")}
        />

        <MarketplaceTile
          label="eBay"
          logoSrc="/brand/marketplaces/ebay.svg"
          logoPreset="compact"
          summary={ebaySummary}
          previousSummary={ebayPrev}
          trend={ebayTrend}
          periodKpis={periodKpis}
          intlTag={intlTag}
          loading={ebayLoading}
          error={ebayError}
          onOpenDetail={() => openDetailAt("ebay")}
        />

        <MarketplaceTile
          label="Otto"
          logoSrc="/brand/marketplaces/otto.svg"
          logoPreset="compact"
          summary={ottoSummary}
          previousSummary={ottoPrev}
          trend={ottoTrend}
          periodKpis={periodKpis}
          intlTag={intlTag}
          loading={ottoLoading}
          error={ottoError}
          onOpenDetail={() => openDetailAt("otto")}
        />

        <MarketplaceTile
          label="Kaufland"
          logoSrc="/brand/marketplaces/kaufland.svg"
          logoPreset="compact"
          summary={kauflandSummary}
          previousSummary={kauflandPrev}
          trend={kauflandTrend}
          periodKpis={periodKpis}
          intlTag={intlTag}
          loading={kauflandLoading}
          error={kauflandError}
          onOpenDetail={() => openDetailAt("kaufland")}
        />

        <MarketplaceTile
          label="Fressnapf"
          logoSrc={WIKIMEDIA_FRESSNAPF_LOGO_2023_SVG}
          logoPreset="compact"
          summary={fressnapfSummary}
          previousSummary={fressnapfPrev}
          trend={fressnapfTrend}
          periodKpis={periodKpis}
          intlTag={intlTag}
          loading={fressnapfLoading}
          error={fressnapfError}
          onOpenDetail={() => openDetailAt("fressnapf")}
        />

        <MarketplaceTile
          label="MediaMarkt & Saturn"
          logoSrc={WIKIMEDIA_MEDIAMARKT_SATURN_LOGO_SVG}
          logoPreset="compact"
          summary={mmsSummary}
          previousSummary={mmsPrev}
          trend={mmsTrend}
          periodKpis={periodKpis}
          intlTag={intlTag}
          loading={mmsLoading}
          error={mmsError}
          onOpenDetail={() => openDetailAt("mediamarkt-saturn")}
        />

        <MarketplaceTile
          label="ZooPlus"
          logoSrc={WIKIMEDIA_ZOOPLUS_LOGO_PNG}
          logoPreset="compact"
          summary={zooplusSummary}
          previousSummary={zooplusPrev}
          trend={zooplusTrend}
          periodKpis={periodKpis}
          intlTag={intlTag}
          loading={zooplusLoading}
          error={zooplusError}
          onOpenDetail={() => openDetailAt("zooplus")}
        />

        <MarketplaceTile
          label="TikTok"
          logoSrc="/brand/marketplaces/tiktok.svg"
          logoPreset="compact"
          summary={tiktokSummary}
          previousSummary={tiktokPrev}
          trend={tiktokTrend}
          periodKpis={periodKpis}
          intlTag={intlTag}
          loading={tiktokLoading}
          onOpenDetail={() => openDetailAt("tiktok")}
        />

        <MarketplaceTile
          label="Shopify"
          logoSrc={WIKIMEDIA_SHOPIFY_LOGO_2018_SVG}
          logoPreset="compact"
          summary={shopifySummary}
          previousSummary={shopifyPrev}
          trend={shopifyTrend}
          periodKpis={periodKpis}
          intlTag={intlTag}
          loading={shopifyLoading}
          onOpenDetail={() => openDetailAt("shopify")}
        />


        {ANALYTICS_MARKETPLACES.filter(
          (m) =>
            m.slug !== "ebay" &&
            m.slug !== "otto" &&
            m.slug !== "kaufland" &&
            m.slug !== "fressnapf" &&
            m.slug !== "mediamarkt-saturn" &&
            m.slug !== "zooplus" &&
            m.slug !== "tiktok" &&
            m.slug !== "shopify"
        ).map(({ slug, label, logo }) => (
          <PlaceholderTile
            key={slug}
            label={label}
            logo={logo}
            onOpenDetail={() => openDetailAt(slug)}
            t={t}
          />
        ))}
      </div>

      <MarketplacePriceParitySection />
    </div>
  );
}

export default dynamic(() => Promise.resolve(AnalyticsMarketplacesPage), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
    </div>
  ),
});
