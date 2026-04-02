"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@/shared/hooks/useUser";
import { useAppStore } from "@/shared/stores/useAppStore";
import {
  clearLegacySectionOrderLocalStorage,
  parseDashboardAccessConfig,
  readLegacySectionOrderFromLocalStorage,
} from "@/shared/lib/dashboard-access-config";
import { DASHBOARD_CLIENT_BACKGROUND_SYNC_MS } from "@/shared/lib/dashboardClientCache";
import { DEFAULT_SETTINGS_USERS_SECTION_ORDER } from "@/shared/lib/settings-users-section-order";

const POLL_MS = DASHBOARD_CLIENT_BACKGROUND_SYNC_MS;

type FetchPayload = {
  config?: unknown;
  updatedAt?: string | null;
};

/**
 * Nach localStorage-Rehydration: alte Kachel-Reihenfolge migrieren, dann Server-Konfiguration laden (überschreibt Regeln).
 * Regelmäßiges Polling mit `updatedAt`, damit globale Änderungen (z. B. WIP-Sperren) bei allen Clients ankommen.
 */
export function DashboardAccessConfigSync() {
  const { id, isLoading } = useUser();
  const lastUpdatedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id || isLoading) return;

    let cancelled = false;

    const applyRemote = (parsed: NonNullable<ReturnType<typeof parseDashboardAccessConfig>>) => {
      useAppStore.getState().hydrateDashboardAccessFromRemote(parsed);
    };

    const fetchAndHydrate = async (opts: { isInitial: boolean }) => {
      await new Promise<void>((resolve) => {
        if (useAppStore.persist.hasHydrated()) {
          resolve();
          return;
        }
        const unsub = useAppStore.persist.onFinishHydration(() => {
          unsub();
          resolve();
        });
      });

      if (cancelled) return;

      if (opts.isInitial) {
        const legacy = readLegacySectionOrderFromLocalStorage();
        if (legacy) {
          const def = [...DEFAULT_SETTINGS_USERS_SECTION_ORDER];
          const cur = useAppStore.getState().settingsUsersSectionOrder;
          if (JSON.stringify(cur) === JSON.stringify(def)) {
            useAppStore.getState().setSettingsUsersSectionOrder(legacy);
          }
          clearLegacySectionOrderLocalStorage();
        }
      }

      try {
        const res = await fetch("/api/dashboard-access-config", { cache: "no-store" });
        const data = (await res.json()) as FetchPayload;
        if (cancelled || !res.ok) return;

        if (
          !opts.isInitial &&
          data.updatedAt &&
          data.updatedAt === lastUpdatedRef.current
        ) {
          return;
        }

        const parsed = data.config ? parseDashboardAccessConfig(data.config) : null;
        if (!parsed) return;

        lastUpdatedRef.current = data.updatedAt ?? lastUpdatedRef.current;
        applyRemote(parsed);
      } catch {
        // Tabelle fehlt oder offline: lokaler / persistierter Store bleibt gültig
      }
    };

    void fetchAndHydrate({ isInitial: true });
    const interval = window.setInterval(() => {
      void fetchAndHydrate({ isInitial: false });
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [id, isLoading]);

  return null;
}
