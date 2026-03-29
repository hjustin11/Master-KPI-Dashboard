"use client";

import { useEffect } from "react";
import { useUser } from "@/shared/hooks/useUser";
import { useAppStore } from "@/shared/stores/useAppStore";
import {
  clearLegacySectionOrderLocalStorage,
  parseDashboardAccessConfig,
  readLegacySectionOrderFromLocalStorage,
} from "@/shared/lib/dashboard-access-config";
import {
  DEFAULT_SETTINGS_USERS_SECTION_ORDER,
} from "@/shared/lib/settings-users-section-order";

/**
 * Nach localStorage-Rehydration: alte Kachel-Reihenfolge migrieren, dann Server-Konfiguration laden (überschreibt Regeln).
 */
export function DashboardAccessConfigSync() {
  const { id, isLoading } = useUser();

  useEffect(() => {
    if (!id || isLoading) return;

    let cancelled = false;

    const run = async () => {
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

      const legacy = readLegacySectionOrderFromLocalStorage();
      if (legacy) {
        const def = [...DEFAULT_SETTINGS_USERS_SECTION_ORDER];
        const cur = useAppStore.getState().settingsUsersSectionOrder;
        if (JSON.stringify(cur) === JSON.stringify(def)) {
          useAppStore.getState().setSettingsUsersSectionOrder(legacy);
        }
        clearLegacySectionOrderLocalStorage();
      }

      try {
        const res = await fetch("/api/dashboard-access-config", { cache: "no-store" });
        const data = (await res.json()) as { config?: unknown };
        if (cancelled || !res.ok) return;
        const parsed = data.config ? parseDashboardAccessConfig(data.config) : null;
        if (parsed) {
          useAppStore.getState().hydrateDashboardAccessFromRemote(parsed);
        }
      } catch {
        // Tabelle fehlt oder offline: lokaler / persistierter Store bleibt gültig
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [id, isLoading]);

  return null;
}
