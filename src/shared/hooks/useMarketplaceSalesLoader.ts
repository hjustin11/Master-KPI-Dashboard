"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { SalesCompareResponse } from "@/shared/lib/marketplace-sales-types";
import {
  AMAZON_FETCH_TIMEOUT_MS,
  defaultPeriod,
  fetchSalesCompareWithTimeout,
} from "@/shared/lib/marketplace-analytics-utils";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readAnalyticsSalesCompareInitial,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";

export type MarketplaceSlugKey =
  | "amazon"
  | "ebay"
  | "otto"
  | "kaufland"
  | "fressnapf"
  | "mms"
  | "zooplus"
  | "tiktok"
  | "shopify";

type LoaderState = {
  data: SalesCompareResponse | null;
  loading: boolean;
  error: string | null;
  backgroundSyncing: boolean;
};

type LoaderConfig = {
  slug: MarketplaceSlugKey;
  storagePrefix: string;
  endpoint: string;
  errorKey: string;
  warnTag: string;
  timeoutMs?: number;
  enabled?: boolean;
  disabledMessage?: string;
  useInFlightRef?: boolean;
};

const CONFIGS: LoaderConfig[] = [
  {
    slug: "amazon",
    storagePrefix: "analytics_amazon_sales_compare_v1",
    endpoint: "/api/amazon/sales",
    errorKey: "analyticsMp.amazonMetricsError",
    warnTag: "Amazon",
    timeoutMs: AMAZON_FETCH_TIMEOUT_MS,
    useInFlightRef: true,
  },
  {
    slug: "ebay",
    storagePrefix: "analytics_ebay_sales_compare_v1",
    endpoint: "/api/ebay/sales",
    errorKey: "analyticsMp.ebayMetricsError",
    warnTag: "eBay",
    disabledMessage: "eBay ist aktuell deaktiviert oder nicht konfiguriert.",
  },
  {
    slug: "otto",
    storagePrefix: "analytics_otto_sales_compare_v1",
    endpoint: "/api/otto/sales",
    errorKey: "analyticsMp.ottoMetricsError",
    warnTag: "Otto",
  },
  {
    slug: "kaufland",
    storagePrefix: "analytics_kaufland_sales_compare_v1",
    endpoint: "/api/kaufland/sales",
    errorKey: "analyticsMp.kauflandMetricsError",
    warnTag: "Kaufland",
  },
  {
    slug: "fressnapf",
    storagePrefix: "analytics_fressnapf_sales_compare_v1",
    endpoint: "/api/fressnapf/sales",
    errorKey: "analyticsMp.fressnapfMetricsError",
    warnTag: "Fressnapf",
  },
  {
    slug: "mms",
    storagePrefix: "analytics_mms_sales_compare_v1",
    endpoint: "/api/mediamarkt-saturn/sales",
    errorKey: "analyticsMp.mmsMetricsError",
    warnTag: "MediaMarkt Saturn",
  },
  {
    slug: "zooplus",
    storagePrefix: "analytics_zooplus_sales_compare_v1",
    endpoint: "/api/zooplus/sales",
    errorKey: "analyticsMp.zooplusMetricsError",
    warnTag: "Zooplus",
  },
  {
    slug: "tiktok",
    storagePrefix: "analytics_tiktok_sales_compare_v1",
    endpoint: "/api/tiktok/sales",
    errorKey: "analyticsMp.tiktokMetricsError",
    warnTag: "TikTok",
    disabledMessage: "TikTok ist aktuell deaktiviert oder nicht konfiguriert.",
  },
  {
    slug: "shopify",
    storagePrefix: "analytics_shopify_sales_compare_v1",
    endpoint: "/api/shopify/sales",
    errorKey: "analyticsMp.shopifyMetricsError",
    warnTag: "Shopify",
  },
];

const salesCompareInitMemo = new Map<string, { data: unknown; loading: boolean }>();

function getInit(storagePrefix: string): { data: SalesCompareResponse | null; loading: boolean } {
  const { from, to } = defaultPeriod();
  const fullKey = `${storagePrefix}:${from}:${to}`;
  const hit = salesCompareInitMemo.get(fullKey);
  if (hit) return hit as { data: SalesCompareResponse | null; loading: boolean };
  const v = readAnalyticsSalesCompareInitial<SalesCompareResponse>(fullKey);
  salesCompareInitMemo.set(fullKey, v);
  return v;
}

function buildInitialStates(): Record<MarketplaceSlugKey, LoaderState> {
  const out = {} as Record<MarketplaceSlugKey, LoaderState>;
  for (const cfg of CONFIGS) {
    const init = getInit(cfg.storagePrefix);
    out[cfg.slug] = {
      data: init.data,
      loading: init.loading,
      error: null,
      backgroundSyncing: false,
    };
  }
  return out;
}

/**
 * Orchestriert alle 9 Marktplatz-Sales-Loader:
 * - Concurrency-Pool (3er) bei Mount + Period-Change
 * - Background-Sync via setInterval (sichtbarkeits-gated)
 * - localStorage-Cache, in-flight-Schutz für Amazon, eBay/TikTok Disable-Short-Circuit
 */
export default function useMarketplaceSalesLoader(params: {
  periodFrom: string;
  periodTo: string;
  periodRef: MutableRefObject<{ from: string; to: string }>;
  t: (key: string, params?: Record<string, string | number>) => string;
}): {
  states: Record<MarketplaceSlugKey, LoaderState>;
  reloaders: Record<MarketplaceSlugKey, (forceRefresh?: boolean, silent?: boolean) => Promise<void>>;
} {
  const { periodFrom, periodTo, periodRef, t } = params;

  const [states, setStates] = useState<Record<MarketplaceSlugKey, LoaderState>>(() =>
    buildInitialStates()
  );
  const [ebayEnabled, setEbayEnabled] = useState(true);
  const [tiktokEnabled, setTiktokEnabled] = useState(true);
  const amazonInFlightRef = useRef(false);
  const [analyticsHasMounted, setAnalyticsHasMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const CACHE_KEY = "analytics_marketplaces_sales_config_status_v1";
    const CACHE_TTL_MS = 5 * 60 * 1000;

    const applyPayload = (payload: {
      ebay?: { configured?: boolean };
      tiktok?: { configured?: boolean };
    }) => {
      if (payload.ebay?.configured === false) setEbayEnabled(false);
      if (payload.tiktok?.configured === false) setTiktokEnabled(false);
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
        return (await res.json()) as {
          ebay?: { configured?: boolean };
          tiktok?: { configured?: boolean };
        };
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
        // Bei Fehlern Kanäle aktiv lassen.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = useCallback((slug: MarketplaceSlugKey, partial: Partial<LoaderState>) => {
    setStates((prev) => ({ ...prev, [slug]: { ...prev[slug], ...partial } }));
  }, []);

  const runLoad = useCallback(
    async (cfg: LoaderConfig, forceRefresh: boolean, silent: boolean) => {
      if (cfg.useInFlightRef && amazonInFlightRef.current) return;
      if (cfg.useInFlightRef) amazonInFlightRef.current = true;

      const isDisabled =
        (cfg.slug === "ebay" && !ebayEnabled) || (cfg.slug === "tiktok" && !tiktokEnabled);
      if (isDisabled) {
        patch(cfg.slug, {
          loading: false,
          backgroundSyncing: false,
          ...(silent ? {} : { error: cfg.disabledMessage ?? null }),
        });
        if (cfg.useInFlightRef) amazonInFlightRef.current = false;
        return;
      }

      const { from, to } = periodRef.current;
      const cacheKey = `${cfg.storagePrefix}:${from}:${to}`;
      let hadCache = false;

      if (!forceRefresh && !silent) {
        const parsed = readLocalJsonCache<{ savedAt: number } & SalesCompareResponse>(cacheKey);
        if (parsed?.summary && !parsed.error) {
          patch(cfg.slug, { data: parsed, loading: false });
          hadCache = true;
        }
      }

      if ((forceRefresh || !hadCache) && !silent) {
        patch(cfg.slug, { loading: true });
      }

      const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
      if (showBackgroundIndicator) {
        patch(cfg.slug, { backgroundSyncing: true });
      }
      if (!silent) {
        patch(cfg.slug, { error: null });
      }

      try {
        const qs = new URLSearchParams({ compare: "true", compareMode: "yoy", from, to });
        const payload = await fetchSalesCompareWithTimeout<SalesCompareResponse>(
          `${cfg.endpoint}?${qs}`,
          t(cfg.errorKey),
          cfg.timeoutMs
        );
        patch(cfg.slug, { data: payload });
        writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
      } catch (e) {
        if (silent) {
          console.warn(`[Analytics ${cfg.warnTag}] Hintergrund-Abgleich fehlgeschlagen:`, e);
        } else {
          patch(cfg.slug, {
            error: e instanceof Error ? e.message : t("commonUi.unknownError"),
          });
        }
      } finally {
        if (!silent) patch(cfg.slug, { loading: false });
        if (showBackgroundIndicator) patch(cfg.slug, { backgroundSyncing: false });
        if (cfg.useInFlightRef) amazonInFlightRef.current = false;
      }
    },
    [ebayEnabled, tiktokEnabled, periodRef, patch, t]
  );

  const reloaders = {} as Record<
    MarketplaceSlugKey,
    (forceRefresh?: boolean, silent?: boolean) => Promise<void>
  >;
  for (const cfg of CONFIGS) {
    reloaders[cfg.slug] = (forceRefresh = false, silent = false) => runLoad(cfg, forceRefresh, silent);
  }

  const runLoadRef = useRef(runLoad);
  runLoadRef.current = runLoad;

  useEffect(() => {
    let cancelled = false;
    const CONCURRENCY = 3;
    (async () => {
      let i = 0;
      const worker = async () => {
        while (!cancelled) {
          const idx = i++;
          if (idx >= CONFIGS.length) return;
          try {
            await runLoadRef.current(CONFIGS[idx], false, false);
          } catch {
            // per-loader errors surfaced inside
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, CONFIGS.length) }, () => worker())
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [periodFrom, periodTo]);

  useEffect(() => {
    setAnalyticsHasMounted(true);
  }, []);

  useEffect(() => {
    if (!analyticsHasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      const CONCURRENCY = 3;
      let i = 0;
      const worker = async () => {
        while (true) {
          const idx = i++;
          if (idx >= CONFIGS.length) return;
          try {
            await runLoadRef.current(CONFIGS[idx], false, true);
          } catch {
            // surfaced per loader
          }
        }
      };
      void Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, CONFIGS.length) }, () => worker())
      );
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [analyticsHasMounted]);

  return { states, reloaders };
}
