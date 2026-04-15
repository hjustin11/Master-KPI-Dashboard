"use client";

import { useEffect, useState } from "react";

/**
 * Lädt `/api/marketplaces/sales-config-status` mit 5-Minuten sessionStorage-Cache.
 *
 * Extrahiert aus `analytics/marketplaces/page.tsx`, um den Seiten-Monolithen schrittweise zu
 * verkleinern. Die Page kann diesen Hook direkt konsumieren; die alte Inline-Logik entfällt.
 *
 * Rückgabe: Flags, ob eBay/TikTok aktiv sein dürfen (beide default `true`, erst bei bestätigtem
 * `configured: false` wird auf `false` gesetzt — damit bei Fehlern/Timeouts die Kacheln aktiv
 * bleiben und nicht versehentlich deaktiviert werden).
 */

const CACHE_KEY = "analytics_marketplaces_sales_config_status_v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

type ConfigStatusPayload = {
  ebay?: { configured?: boolean };
  tiktok?: { configured?: boolean };
};

type CachedEntry = { at: number; payload: ConfigStatusPayload };

export type MarketplaceSalesConfigStatus = {
  ebayEnabled: boolean;
  tiktokEnabled: boolean;
};

export function useMarketplaceSalesConfigStatus(): MarketplaceSalesConfigStatus {
  const [ebayEnabled, setEbayEnabled] = useState(true);
  const [tiktokEnabled, setTiktokEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const apply = (payload: ConfigStatusPayload) => {
      if (payload.ebay?.configured === false) setEbayEnabled(false);
      if (payload.tiktok?.configured === false) setTiktokEnabled(false);
    };

    try {
      const raw = window.sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as CachedEntry | null;
        if (cached && typeof cached.at === "number" && Date.now() - cached.at < CACHE_TTL_MS) {
          apply(cached.payload);
          return () => {
            cancelled = true;
          };
        }
      }
    } catch {
      // Cache-Read-Fehler sind nicht fatal — wir fallen zurück auf Live-Fetch.
    }

    void fetch("/api/marketplaces/sales-config-status", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as ConfigStatusPayload;
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        apply(payload);
        try {
          window.sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ at: Date.now(), payload } satisfies CachedEntry)
          );
        } catch {
          // Quota / Privacy-Mode — bewusst ignorieren.
        }
      })
      .catch(() => {
        // Netzfehler: alle Kanäle aktiv lassen, um keine falschen Deaktivierungen auszulösen.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { ebayEnabled, tiktokEnabled };
}
