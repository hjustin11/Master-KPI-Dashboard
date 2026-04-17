"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { SalesCompareResponse } from "@/shared/lib/marketplace-sales-types";
import {
  AMAZON_FETCH_TIMEOUT_MS,
  fetchSalesCompareWithTimeout,
} from "@/shared/lib/marketplace-analytics-utils";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import {
  AMAZON_EU_MARKETPLACES,
  DEFAULT_AMAZON_SLUG,
  type AmazonMarketplaceConfig,
} from "@/shared/config/amazonMarketplaces";

export type AmazonCountryLoaderState = {
  data: SalesCompareResponse | null;
  loading: boolean;
  error: string | null;
  backgroundSyncing: boolean;
};

/**
 * Lädt Sales-Daten nur für ADDITIONAL Amazon-Länder (alles außer DE).
 * DE wird vom Haupt-Loader (`useMarketplaceSalesLoader`) geladen unter dem
 * Slug `amazon` — hier würde es doppelt laden. Daher nur `enabled && !amazon-de`.
 */
export default function useAmazonCountriesSalesLoader(params: {
  periodFrom: string;
  periodTo: string;
  periodRef: MutableRefObject<{ from: string; to: string }>;
  t: (key: string, params?: Record<string, string | number>) => string;
}): {
  marketplaces: AmazonMarketplaceConfig[];
  states: Record<string, AmazonCountryLoaderState>;
  reloaders: Record<string, (forceRefresh?: boolean, silent?: boolean) => Promise<void>>;
} {
  const { periodFrom, periodTo, periodRef, t } = params;

  const extras = useMemo(
    () => AMAZON_EU_MARKETPLACES.filter((m) => m.enabled && m.slug !== DEFAULT_AMAZON_SLUG),
    []
  );

  const [states, setStates] = useState<Record<string, AmazonCountryLoaderState>>(() => {
    const out: Record<string, AmazonCountryLoaderState> = {};
    for (const m of extras) {
      out[m.slug] = { data: null, loading: true, error: null, backgroundSyncing: false };
    }
    return out;
  });

  const patch = useCallback(
    (slug: string, partial: Partial<AmazonCountryLoaderState>) => {
      setStates((prev) => ({
        ...prev,
        [slug]: { ...(prev[slug] ?? { data: null, loading: false, error: null, backgroundSyncing: false }), ...partial },
      }));
    },
    []
  );

  const runLoad = useCallback(
    async (slug: string, forceRefresh: boolean, silent: boolean) => {
      const { from, to } = periodRef.current;
      const storageKey = `analytics_amazon_country_sales_compare_v1_${slug}:${from}:${to}`;
      let hadCache = false;

      if (!forceRefresh && !silent) {
        const parsed = readLocalJsonCache<{ savedAt: number } & SalesCompareResponse>(storageKey);
        if (parsed?.summary && !parsed.error) {
          patch(slug, { data: parsed, loading: false });
          hadCache = true;
        }
      }

      if ((forceRefresh || !hadCache) && !silent) {
        patch(slug, { loading: true });
      }

      const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
      if (showBackgroundIndicator) patch(slug, { backgroundSyncing: true });
      if (!silent) patch(slug, { error: null });

      try {
        const qs = new URLSearchParams({ compare: "true", compareMode: "yoy", from, to });
        const endpoint = `/api/amazon/${slug}/sales?${qs.toString()}`;
        const payload = await fetchSalesCompareWithTimeout<SalesCompareResponse>(
          endpoint,
          t("analyticsMp.amazonMetricsError"),
          AMAZON_FETCH_TIMEOUT_MS
        );
        patch(slug, { data: payload });
        writeLocalJsonCache(storageKey, { savedAt: Date.now(), ...payload });
      } catch (e) {
        if (silent) {
          console.warn(`[Analytics Amazon ${slug}] Hintergrund-Abgleich fehlgeschlagen:`, e);
        } else {
          patch(slug, { error: e instanceof Error ? e.message : t("commonUi.unknownError") });
        }
      } finally {
        if (!silent) patch(slug, { loading: false });
        if (showBackgroundIndicator) patch(slug, { backgroundSyncing: false });
      }
    },
    [periodRef, patch, t]
  );

  const runLoadRef = useRef(runLoad);
  runLoadRef.current = runLoad;

  useEffect(() => {
    if (extras.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const m of extras) {
        if (cancelled) break;
        await runLoadRef.current(m.slug, false, false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [periodFrom, periodTo, extras]);

  useEffect(() => {
    if (extras.length === 0) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      for (const m of extras) {
        void runLoadRef.current(m.slug, false, true);
      }
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [extras]);

  const reloaders: Record<string, (forceRefresh?: boolean, silent?: boolean) => Promise<void>> = {};
  for (const m of extras) {
    reloaders[m.slug] = (forceRefresh = false, silent = false) =>
      runLoad(m.slug, forceRefresh, silent);
  }

  return { marketplaces: extras, states, reloaders };
}
