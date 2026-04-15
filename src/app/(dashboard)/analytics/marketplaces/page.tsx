"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { ANALYTICS_MARKETPLACES, getMarketplaceBySlug } from "@/shared/lib/analytics-marketplaces";
import { MarketplacePriceParitySection } from "./MarketplacePriceParitySection";
import { enumerateYmd } from "./MarketplaceRevenueChart";
import {
  MARKETPLACE_REVENUE_LINE_COLORS,
  type MarketplaceRevenueLineSeries,
} from "./MarketplaceTotalRevenueLinesChart";
import { bandsForTotalChart } from "./marketplaceActionBands";
import { PromotionDealsDialog } from "./PromotionDealsDialog";
import { usePromotionDeals } from "./usePromotionDeals";
import type { MarketplaceReportRow } from "./MarketplaceReportPrintView";
import { DevelopmentReportDialog } from "./DevelopmentReportDialog";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readAnalyticsSalesCompareInitial,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
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
  type SalesCompareResponse,
  MARKETPLACE_TILE_GRID_CLASS,
} from "@/shared/lib/marketplace-sales-types";
import {
  AMAZON_FETCH_TIMEOUT_MS,
  buildMarketplaceTotals,
  buildReportRow,
  defaultPeriod,
  fetchSalesCompareWithTimeout,
  formatTrendPct,
  kpiLabelsForPeriod,
  pickRevenueChartCurrency,
} from "@/shared/lib/marketplace-analytics-utils";
import { MarketplaceTile } from "./components/MarketplaceTile";
import { PlaceholderTile } from "./components/MarketplacePlaceholderTile";
import { TotalMarketplacesKpiStrip } from "./components/TotalMarketplacesKpiStrip";
import { MarketplaceNetSummarySection } from "./components/MarketplaceNetSummarySection";
import { PdfReportDialog } from "./components/PdfReportDialog";
import { MarketplaceDetailDialog } from "./components/MarketplaceDetailDialog";
import useMarketplacePeriod from "@/shared/hooks/useMarketplacePeriod";
import useMarketplaceDetailNavigation from "@/shared/hooks/useMarketplaceDetailNavigation";
import usePdfReportDialog from "@/shared/hooks/usePdfReportDialog";

type AmazonSalesCompareResponse = SalesCompareResponse;
type OttoSalesCompareResponse = SalesCompareResponse;
type EbaySalesCompareResponse = SalesCompareResponse;
type KauflandSalesCompareResponse = SalesCompareResponse;
type FressnapfSalesCompareResponse = SalesCompareResponse;
type MmsSalesCompareResponse = SalesCompareResponse;
type ZooplusSalesCompareResponse = SalesCompareResponse;
type TiktokSalesCompareResponse = SalesCompareResponse;
type ShopifySalesCompareResponse = SalesCompareResponse;

const salesCompareInitMemo = new Map<string, { data: unknown; loading: boolean }>();

/** Einmal pro storagePrefix + Default-Zeitraum: vermeidet doppeltes Lesen von localStorage bei useState. */
function getSalesCompareInitForDefaultPeriod<T extends AmazonSalesCompareResponse>(
  storagePrefix: string
): { data: T | null; loading: boolean } {
  const { from, to } = defaultPeriod();
  const fullKey = `${storagePrefix}:${from}:${to}`;
  const hit = salesCompareInitMemo.get(fullKey);
  if (hit) return hit as { data: T | null; loading: boolean };
  const v = readAnalyticsSalesCompareInitial<T>(fullKey);
  salesCompareInitMemo.set(fullKey, v);
  return v;
}

function AnalyticsMarketplacesPage() {
  const { t, locale } = useTranslation();
  const dfLocale = getDateFnsLocale(locale);
  const intlTag = intlLocaleTag(locale);

  const { period, setPeriod, periodRef, forceUnblockTotalStrip } = useMarketplacePeriod();
  const [amazonData, setAmazonData] = useState<AmazonSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<AmazonSalesCompareResponse>("analytics_amazon_sales_compare_v1").data
  );
  const [amazonLoading, setAmazonLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<AmazonSalesCompareResponse>("analytics_amazon_sales_compare_v1").loading
  );
  const [amazonBackgroundSyncing, setAmazonBackgroundSyncing] = useState(false);
  const [amazonError, setAmazonError] = useState<string | null>(null);
  const [ebayData, setEbayData] = useState<EbaySalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<EbaySalesCompareResponse>("analytics_ebay_sales_compare_v1").data
  );
  const [ebayLoading, setEbayLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<EbaySalesCompareResponse>("analytics_ebay_sales_compare_v1").loading
  );
  const [ebayBackgroundSyncing, setEbayBackgroundSyncing] = useState(false);
  const [ebayError, setEbayError] = useState<string | null>(null);
  const [ottoData, setOttoData] = useState<OttoSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<OttoSalesCompareResponse>("analytics_otto_sales_compare_v1").data
  );
  const [ottoLoading, setOttoLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<OttoSalesCompareResponse>("analytics_otto_sales_compare_v1").loading
  );
  const [ottoBackgroundSyncing, setOttoBackgroundSyncing] = useState(false);
  const [ottoError, setOttoError] = useState<string | null>(null);
  const [kauflandData, setKauflandData] = useState<KauflandSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<KauflandSalesCompareResponse>("analytics_kaufland_sales_compare_v1").data
  );
  const [kauflandLoading, setKauflandLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<KauflandSalesCompareResponse>("analytics_kaufland_sales_compare_v1").loading
  );
  const [kauflandBackgroundSyncing, setKauflandBackgroundSyncing] = useState(false);
  const [kauflandError, setKauflandError] = useState<string | null>(null);
  const [fressnapfData, setFressnapfData] = useState<FressnapfSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<FressnapfSalesCompareResponse>("analytics_fressnapf_sales_compare_v1").data
  );
  const [fressnapfLoading, setFressnapfLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<FressnapfSalesCompareResponse>("analytics_fressnapf_sales_compare_v1").loading
  );
  const [fressnapfBackgroundSyncing, setFressnapfBackgroundSyncing] = useState(false);
  const [fressnapfError, setFressnapfError] = useState<string | null>(null);
  const [mmsData, setMmsData] = useState<MmsSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<MmsSalesCompareResponse>("analytics_mms_sales_compare_v1").data
  );
  const [mmsLoading, setMmsLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<MmsSalesCompareResponse>("analytics_mms_sales_compare_v1").loading
  );
  const [mmsBackgroundSyncing, setMmsBackgroundSyncing] = useState(false);
  const [mmsError, setMmsError] = useState<string | null>(null);
  const [zooplusData, setZooplusData] = useState<ZooplusSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<ZooplusSalesCompareResponse>("analytics_zooplus_sales_compare_v1").data
  );
  const [zooplusLoading, setZooplusLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<ZooplusSalesCompareResponse>("analytics_zooplus_sales_compare_v1").loading
  );
  const [zooplusBackgroundSyncing, setZooplusBackgroundSyncing] = useState(false);
  const [zooplusError, setZooplusError] = useState<string | null>(null);
  const [tiktokData, setTiktokData] = useState<TiktokSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<TiktokSalesCompareResponse>("analytics_tiktok_sales_compare_v1").data
  );
  const [tiktokLoading, setTiktokLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<TiktokSalesCompareResponse>("analytics_tiktok_sales_compare_v1").loading
  );
  const [tiktokBackgroundSyncing, setTiktokBackgroundSyncing] = useState(false);
  const [tiktokError, setTiktokError] = useState<string | null>(null);
  const [shopifyData, setShopifyData] = useState<ShopifySalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<ShopifySalesCompareResponse>("analytics_shopify_sales_compare_v1").data
  );
  const [shopifyLoading, setShopifyLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<ShopifySalesCompareResponse>("analytics_shopify_sales_compare_v1").loading
  );
  const [shopifyBackgroundSyncing, setShopifyBackgroundSyncing] = useState(false);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [analyticsHasMounted, setAnalyticsHasMounted] = useState(false);
  const [ebaySalesEnabled, setEbaySalesEnabled] = useState(true);
  const [tiktokSalesEnabled, setTiktokSalesEnabled] = useState(true);
  const amazonRequestInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const CACHE_KEY = "analytics_marketplaces_sales_config_status_v1";
    const CACHE_TTL_MS = 5 * 60 * 1000;

    const applyPayload = (payload: {
      ebay?: { configured?: boolean };
      tiktok?: { configured?: boolean };
    }) => {
      if (payload.ebay?.configured === false) setEbaySalesEnabled(false);
      if (payload.tiktok?.configured === false) setTiktokSalesEnabled(false);
    };

    try {
      const cachedRaw = window.sessionStorage.getItem(CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as {
          at: number;
          payload: { ebay?: { configured?: boolean }; tiktok?: { configured?: boolean } };
        };
        if (cached && typeof cached.at === "number" && Date.now() - cached.at < CACHE_TTL_MS) {
          applyPayload(cached.payload);
          return () => {
            cancelled = true;
          };
        }
      }
    } catch {
      // ignore cache read errors
    }

    void fetch("/api/marketplaces/sales-config-status", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const payload = (await res.json()) as {
          ebay?: { configured?: boolean };
          tiktok?: { configured?: boolean };
        };
        return payload;
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        applyPayload(payload);
        try {
          window.sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ at: Date.now(), payload })
          );
        } catch {
          // ignore cache write errors (quota, privacy mode)
        }
      })
      .catch(() => {
        // Bei Fehlern alle Kanaele aktiv lassen, um keine falschen Deaktivierungen auszulösen.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAmazonSales = useCallback(async (forceRefresh = false, silent = false) => {
    if (amazonRequestInFlightRef.current) {
      return;
    }
    amazonRequestInFlightRef.current = true;
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_amazon_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & AmazonSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setAmazonData(data);
        hadCache = true;
        setAmazonLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setAmazonLoading(true);
    } else if (!hadCache && !silent) {
      setAmazonLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setAmazonBackgroundSyncing(true);
    }

    if (!silent) {
      setAmazonError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<AmazonSalesCompareResponse>(
        `/api/amazon/sales?${params}`,
        t("analyticsMp.amazonMetricsError"),
        AMAZON_FETCH_TIMEOUT_MS
      );
      setAmazonData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics Amazon] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setAmazonError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setAmazonLoading(false);
      }
      if (showBackgroundIndicator) {
        setAmazonBackgroundSyncing(false);
      }
      amazonRequestInFlightRef.current = false;
    }
  }, [t, periodRef]);

  const loadEbaySales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_ebay_sales_compare_v1:${from}:${to}`;
    let hadCache = false;
    if (!ebaySalesEnabled) {
      setEbayLoading(false);
      setEbayBackgroundSyncing(false);
      if (!silent) {
        setEbayError("eBay ist aktuell deaktiviert oder nicht konfiguriert.");
      }
      return;
    }

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & EbaySalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setEbayData(data);
        hadCache = true;
        setEbayLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setEbayLoading(true);
    } else if (!hadCache && !silent) {
      setEbayLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setEbayBackgroundSyncing(true);
    }

    if (!silent) {
      setEbayError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<EbaySalesCompareResponse>(
        `/api/ebay/sales?${params}`,
        t("analyticsMp.ebayMetricsError")
      );
      setEbayData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics eBay] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setEbayError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setEbayLoading(false);
      }
      if (showBackgroundIndicator) {
        setEbayBackgroundSyncing(false);
      }
    }
  }, [ebaySalesEnabled, t, periodRef]);

  const loadOttoSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_otto_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & OttoSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setOttoData(data);
        hadCache = true;
        setOttoLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setOttoLoading(true);
    } else if (!hadCache && !silent) {
      setOttoLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setOttoBackgroundSyncing(true);
    }

    if (!silent) {
      setOttoError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<OttoSalesCompareResponse>(
        `/api/otto/sales?${params}`,
        t("analyticsMp.ottoMetricsError")
      );
      setOttoData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics Otto] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setOttoError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setOttoLoading(false);
      }
      if (showBackgroundIndicator) {
        setOttoBackgroundSyncing(false);
      }
    }
  }, [t, periodRef]);

  const loadKauflandSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_kaufland_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & KauflandSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setKauflandData(data);
        hadCache = true;
        setKauflandLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setKauflandLoading(true);
    } else if (!hadCache && !silent) {
      setKauflandLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setKauflandBackgroundSyncing(true);
    }

    if (!silent) {
      setKauflandError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<KauflandSalesCompareResponse>(
        `/api/kaufland/sales?${params}`,
        t("analyticsMp.kauflandMetricsError")
      );
      setKauflandData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics Kaufland] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setKauflandError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setKauflandLoading(false);
      }
      if (showBackgroundIndicator) {
        setKauflandBackgroundSyncing(false);
      }
    }
  }, [t, periodRef]);

  const loadFressnapfSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_fressnapf_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & FressnapfSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setFressnapfData(data);
        hadCache = true;
        setFressnapfLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setFressnapfLoading(true);
    } else if (!hadCache && !silent) {
      setFressnapfLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setFressnapfBackgroundSyncing(true);
    }

    if (!silent) {
      setFressnapfError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<FressnapfSalesCompareResponse>(
        `/api/fressnapf/sales?${params}`,
        t("analyticsMp.fressnapfMetricsError")
      );
      setFressnapfData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics Fressnapf] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setFressnapfError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setFressnapfLoading(false);
      }
      if (showBackgroundIndicator) {
        setFressnapfBackgroundSyncing(false);
      }
    }
  }, [t, periodRef]);

  const loadMmsSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_mms_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & MmsSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setMmsData(data);
        hadCache = true;
        setMmsLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setMmsLoading(true);
    } else if (!hadCache && !silent) {
      setMmsLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setMmsBackgroundSyncing(true);
    }

    if (!silent) {
      setMmsError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<MmsSalesCompareResponse>(
        `/api/mediamarkt-saturn/sales?${params}`,
        t("analyticsMp.mmsMetricsError")
      );
      setMmsData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics MMS] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setMmsError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setMmsLoading(false);
      }
      if (showBackgroundIndicator) {
        setMmsBackgroundSyncing(false);
      }
    }
  }, [t, periodRef]);

  const loadZooplusSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_zooplus_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & ZooplusSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setZooplusData(data);
        hadCache = true;
        setZooplusLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setZooplusLoading(true);
    } else if (!hadCache && !silent) {
      setZooplusLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setZooplusBackgroundSyncing(true);
    }

    if (!silent) {
      setZooplusError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<ZooplusSalesCompareResponse>(
        `/api/zooplus/sales?${params}`,
        t("analyticsMp.zooplusMetricsError")
      );
      setZooplusData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics ZooPlus] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setZooplusError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setZooplusLoading(false);
      }
      if (showBackgroundIndicator) {
        setZooplusBackgroundSyncing(false);
      }
    }
  }, [t, periodRef]);

  const loadTiktokSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_tiktok_sales_compare_v1:${from}:${to}`;
    let hadCache = false;
    if (!tiktokSalesEnabled) {
      setTiktokLoading(false);
      setTiktokBackgroundSyncing(false);
      if (!silent) {
        setTiktokError("TikTok ist aktuell deaktiviert oder nicht konfiguriert.");
      }
      return;
    }

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & TiktokSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setTiktokData(data);
        hadCache = true;
        setTiktokLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setTiktokLoading(true);
    } else if (!hadCache && !silent) {
      setTiktokLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setTiktokBackgroundSyncing(true);
    }

    if (!silent) {
      setTiktokError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<TiktokSalesCompareResponse>(
        `/api/tiktok/sales?${params}`,
        t("analyticsMp.tiktokMetricsError")
      );
      setTiktokData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics TikTok] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setTiktokError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setTiktokLoading(false);
      }
      if (showBackgroundIndicator) {
        setTiktokBackgroundSyncing(false);
      }
    }
  }, [t, tiktokSalesEnabled, periodRef]);

  const loadShopifySales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_shopify_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & ShopifySalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setShopifyData(data);
        hadCache = true;
        setShopifyLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setShopifyLoading(true);
    } else if (!hadCache && !silent) {
      setShopifyLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setShopifyBackgroundSyncing(true);
    }

    if (!silent) {
      setShopifyError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<ShopifySalesCompareResponse>(
        `/api/shopify/sales?${params}`,
        t("analyticsMp.shopifyMetricsError")
      );
      setShopifyData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics Shopify] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setShopifyError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setShopifyLoading(false);
      }
      if (showBackgroundIndicator) {
        setShopifyBackgroundSyncing(false);
      }
    }
  }, [t, periodRef]);

  const loadAmazonSalesRef = useRef(loadAmazonSales);
  loadAmazonSalesRef.current = loadAmazonSales;
  const loadEbaySalesRef = useRef(loadEbaySales);
  loadEbaySalesRef.current = loadEbaySales;
  const loadOttoSalesRef = useRef(loadOttoSales);
  loadOttoSalesRef.current = loadOttoSales;
  const loadKauflandSalesRef = useRef(loadKauflandSales);
  loadKauflandSalesRef.current = loadKauflandSales;
  const loadFressnapfSalesRef = useRef(loadFressnapfSales);
  loadFressnapfSalesRef.current = loadFressnapfSales;
  const loadMmsSalesRef = useRef(loadMmsSales);
  loadMmsSalesRef.current = loadMmsSales;
  const loadZooplusSalesRef = useRef(loadZooplusSales);
  loadZooplusSalesRef.current = loadZooplusSales;
  const loadTiktokSalesRef = useRef(loadTiktokSales);
  loadTiktokSalesRef.current = loadTiktokSales;
  const loadShopifySalesRef = useRef(loadShopifySales);
  loadShopifySalesRef.current = loadShopifySales;

  useEffect(() => {
    let cancelled = false;
    const loaders = [
      loadAmazonSalesRef,
      loadEbaySalesRef,
      loadOttoSalesRef,
      loadKauflandSalesRef,
      loadFressnapfSalesRef,
      loadMmsSalesRef,
      loadZooplusSalesRef,
      loadTiktokSalesRef,
      loadShopifySalesRef,
    ];
    const CONCURRENCY = 3;
    (async () => {
      let i = 0;
      const worker = async () => {
        while (!cancelled) {
          const idx = i++;
          if (idx >= loaders.length) return;
          try {
            await loaders[idx].current(false, false);
          } catch {
            // per-loader errors are surfaced inside each loader
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, loaders.length) }, () => worker())
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [period.from, period.to]);

  useEffect(() => {
    setAnalyticsHasMounted(true);
  }, []);

  useEffect(() => {
    if (!analyticsHasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      const loaders = [
        loadAmazonSalesRef,
        loadEbaySalesRef,
        loadOttoSalesRef,
        loadKauflandSalesRef,
        loadFressnapfSalesRef,
        loadMmsSalesRef,
        loadZooplusSalesRef,
        loadTiktokSalesRef,
        loadShopifySalesRef,
      ];
      const CONCURRENCY = 3;
      let i = 0;
      const worker = async () => {
        while (true) {
          const idx = i++;
          if (idx >= loaders.length) return;
          try {
            await loaders[idx].current(false, true);
          } catch {
            // surfaced per loader
          }
        }
      };
      void Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, loaders.length) }, () => worker())
      );
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [analyticsHasMounted]);

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

  const totals = useMemo(
    () =>
      buildMarketplaceTotals([
        {
          summary: amazonData?.summary,
          previousSummary: amazonData?.previousSummary,
          revenueDeltaPct: amazonData?.revenueDeltaPct,
        },
        {
          summary: ebayData?.summary,
          previousSummary: ebayData?.previousSummary,
          revenueDeltaPct: ebayData?.revenueDeltaPct,
        },
        {
          summary: ottoData?.summary,
          previousSummary: ottoData?.previousSummary,
          revenueDeltaPct: ottoData?.revenueDeltaPct,
        },
        {
          summary: kauflandData?.summary,
          previousSummary: kauflandData?.previousSummary,
          revenueDeltaPct: kauflandData?.revenueDeltaPct,
        },
        {
          summary: fressnapfData?.summary,
          previousSummary: fressnapfData?.previousSummary,
          revenueDeltaPct: fressnapfData?.revenueDeltaPct,
        },
        {
          summary: mmsData?.summary,
          previousSummary: mmsData?.previousSummary,
          revenueDeltaPct: mmsData?.revenueDeltaPct,
        },
        {
          summary: zooplusData?.summary,
          previousSummary: zooplusData?.previousSummary,
          revenueDeltaPct: zooplusData?.revenueDeltaPct,
        },
        {
          summary: tiktokData?.summary,
          previousSummary: tiktokData?.previousSummary,
          revenueDeltaPct: tiktokData?.revenueDeltaPct,
        },
        {
          summary: shopifyData?.summary,
          previousSummary: shopifyData?.previousSummary,
          revenueDeltaPct: shopifyData?.revenueDeltaPct,
        },
      ]),
    [amazonData, ebayData, ottoData, kauflandData, fressnapfData, mmsData, zooplusData, tiktokData, shopifyData]
  );

  const anySalesLoading = useMemo(
    () =>
      amazonLoading ||
      ebayLoading ||
      ottoLoading ||
      kauflandLoading ||
      fressnapfLoading ||
      mmsLoading ||
      zooplusLoading ||
      tiktokLoading ||
      shopifyLoading,
    [
      amazonLoading,
      ebayLoading,
      ottoLoading,
      kauflandLoading,
      fressnapfLoading,
      mmsLoading,
      zooplusLoading,
      tiktokLoading,
      shopifyLoading,
    ]
  );

  const hasAnyMarketplaceSummary = useMemo(
    () =>
      !!(
        amazonData?.summary ||
        ebayData?.summary ||
        ottoData?.summary ||
        kauflandData?.summary ||
        fressnapfData?.summary ||
        mmsData?.summary ||
        zooplusData?.summary ||
        tiktokData?.summary ||
        shopifyData?.summary
      ),
    [
      amazonData,
      ebayData,
      ottoData,
      kauflandData,
      fressnapfData,
      mmsData,
      zooplusData,
      tiktokData,
      shopifyData,
    ]
  );

  /** Skeleton nur beim allerersten Laden ohne irgendeine Kanal-Summary; sonst alte Werte bis zum Replace. */
  const totalStripBlocking = anySalesLoading && !hasAnyMarketplaceSummary && !forceUnblockTotalStrip;

  const stripBackgroundSyncing =
    amazonBackgroundSyncing ||
    ebayBackgroundSyncing ||
    ottoBackgroundSyncing ||
    kauflandBackgroundSyncing ||
    fressnapfBackgroundSyncing ||
    mmsBackgroundSyncing ||
    zooplusBackgroundSyncing ||
    tiktokBackgroundSyncing ||
    shopifyBackgroundSyncing ||
    (anySalesLoading && hasAnyMarketplaceSummary);

  const revenueChartCurrency = useMemo(
    () =>
      pickRevenueChartCurrency(
        totals,
        amazonData,
        ebayData,
        ottoData,
        kauflandData,
        fressnapfData,
        mmsData,
        zooplusData,
        tiktokData,
        shopifyData
      ),
    [
      totals,
      amazonData,
      ebayData,
      ottoData,
      kauflandData,
      fressnapfData,
      mmsData,
      zooplusData,
      tiktokData,
      shopifyData,
    ]
  );

  const revenueLineSeries = useMemo((): MarketplaceRevenueLineSeries[] => {
    const ref = revenueChartCurrency;
    const pts = (data: AmazonSalesCompareResponse | null | undefined) =>
      data?.summary?.currency === ref ? data.points ?? [] : [];
    const out: MarketplaceRevenueLineSeries[] = [
      {
        id: "amazon",
        dataKey: "amazon",
        label: "Amazon",
        color: MARKETPLACE_REVENUE_LINE_COLORS.amazon,
        points: pts(amazonData),
      },
    ];
    const slugList = [
      "ebay",
      "otto",
      "kaufland",
      "fressnapf",
      "mediamarkt-saturn",
      "zooplus",
      "tiktok",
      "shopify",
    ] as const;
    for (const slug of slugList) {
      const mp = getMarketplaceBySlug(slug);
      const data =
        slug === "ebay"
          ? ebayData
          : slug === "otto"
          ? ottoData
          : slug === "kaufland"
            ? kauflandData
            : slug === "fressnapf"
              ? fressnapfData
              : slug === "mediamarkt-saturn"
                ? mmsData
                : slug === "zooplus"
                  ? zooplusData
                  : slug === "tiktok"
                    ? tiktokData
                    : shopifyData;
      out.push({
        id: slug,
        dataKey: slug,
        label: mp?.label ?? slug,
        color: MARKETPLACE_REVENUE_LINE_COLORS[slug] ?? "#64748b",
        points: pts(data),
      });
    }
    return out;
  }, [
    revenueChartCurrency,
    amazonData,
    ebayData,
    ottoData,
    kauflandData,
    fressnapfData,
    mmsData,
    zooplusData,
    tiktokData,
    shopifyData,
  ]);

  const totalChartDailyOrdersAndPrev = useMemo(() => {
    const dates = enumerateYmd(period.from, period.to);
    const ref = revenueChartCurrency;
    const channels: (AmazonSalesCompareResponse | null | undefined)[] = [
      amazonData,
      ebayData,
      ottoData,
      kauflandData,
      fressnapfData,
      mmsData,
      zooplusData,
      tiktokData,
      shopifyData,
    ];
    const dailyOrders = dates.map((date) =>
      channels.reduce((sum, d) => {
        if (!d?.summary || d.summary.currency !== ref) return sum;
        const pt = d.points?.find((p) => p.date === date);
        return sum + (pt?.orders ?? 0);
      }, 0)
    );
    const prevRevenue = dates.map((_, i) =>
      channels.reduce((sum, d) => {
        if (!d?.summary || d.summary.currency !== ref) return sum;
        const pv = d.previousPoints?.[i];
        return sum + (pv?.amount ?? 0);
      }, 0)
    );
    const hasPrev = prevRevenue.some((v) => v > 0);
    return { dailyOrders, previousRevenue: hasPrev ? prevRevenue : null };
  }, [
    period.from,
    period.to,
    revenueChartCurrency,
    amazonData,
    ebayData,
    ottoData,
    kauflandData,
    fressnapfData,
    mmsData,
    zooplusData,
    tiktokData,
    shopifyData,
  ]);

  const periodKpis = useMemo(
    () => kpiLabelsForPeriod(period.from, period.to, dfLocale, t),
    [period.from, period.to, dfLocale, t]
  );
  const reportRows = useMemo<MarketplaceReportRow[]>(
    () => [
      buildReportRow({ id: "amazon", label: "Amazon", data: amazonData }),
      buildReportRow({ id: "ebay", label: "eBay", data: ebayData }),
      buildReportRow({ id: "otto", label: "Otto", data: ottoData }),
      buildReportRow({ id: "kaufland", label: "Kaufland", data: kauflandData }),
      buildReportRow({ id: "fressnapf", label: "Fressnapf", data: fressnapfData }),
      buildReportRow({ id: "mediamarkt-saturn", label: "MediaMarkt Saturn", data: mmsData }),
      buildReportRow({ id: "zooplus", label: "Zooplus", data: zooplusData }),
      buildReportRow({ id: "tiktok", label: "TikTok Shop", data: tiktokData }),
      buildReportRow({ id: "shopify", label: "Shopify", data: shopifyData }),
    ],
    [amazonData, ebayData, ottoData, kauflandData, fressnapfData, mmsData, zooplusData, tiktokData, shopifyData]
  );
  const netSummary = useMemo(() => {
    if (!totals) return null;
    const sameCurrencyRows = reportRows.filter((row) => row.currency === totals.currency);
    const current = {
      revenue: sameCurrencyRows.reduce((sum, row) => sum + row.currentRevenue, 0),
      orders: sameCurrencyRows.reduce((sum, row) => sum + row.currentOrders, 0),
      units: sameCurrencyRows.reduce((sum, row) => sum + row.currentUnits, 0),
      returnedAmount: sameCurrencyRows.reduce((sum, row) => sum + row.currentReturned, 0),
      cancelledAmount: sameCurrencyRows.reduce((sum, row) => sum + row.currentCancelled, 0),
      returnsAmount: sameCurrencyRows.reduce((sum, row) => sum + row.currentReturns, 0),
      feesAmount: sameCurrencyRows.reduce((sum, row) => sum + row.currentFees, 0),
      adSpendAmount: sameCurrencyRows.reduce((sum, row) => sum + row.currentAds, 0),
    };
    const previous = {
      revenue: sameCurrencyRows.reduce((sum, row) => sum + row.previousRevenue, 0),
      orders: sameCurrencyRows.reduce((sum, row) => sum + row.previousOrders, 0),
      units: sameCurrencyRows.reduce((sum, row) => sum + row.previousUnits, 0),
      returnedAmount: sameCurrencyRows.reduce((sum, row) => sum + row.previousReturned, 0),
      cancelledAmount: sameCurrencyRows.reduce((sum, row) => sum + row.previousCancelled, 0),
      returnsAmount: sameCurrencyRows.reduce((sum, row) => sum + row.previousReturns, 0),
      feesAmount: sameCurrencyRows.reduce((sum, row) => sum + row.previousFees, 0),
      adSpendAmount: sameCurrencyRows.reduce((sum, row) => sum + row.previousAds, 0),
    };
    const currentNet =
      current.revenue - current.returnsAmount - current.feesAmount - current.adSpendAmount;
    const previousNet =
      previous.revenue - previous.returnsAmount - previous.feesAmount - previous.adSpendAmount;
    const coverageOrder = { api: 0, mixed: 1, estimated: 2 } as const;
    const coverage = sameCurrencyRows.reduce<"api" | "mixed" | "estimated">((worst, row) => {
      return coverageOrder[row.costCoverage] > coverageOrder[worst] ? row.costCoverage : worst;
    }, "api");
    return {
      currency: totals.currency,
      current,
      previous,
      currentNet,
      previousNet,
      note: `Datendeckung gesamt: ${coverage}. Returned/Cancelled werden statusbasiert ausgewertet, Gebühren via API oder konfigurierten Prozentsatz.`,
    };
  }, [totals, reportRows]);

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
