"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadPromotionDeals,
  migrateLegacyBandsToGlobalIfNeeded,
  savePromotionDeals,
  type PromotionDeal,
} from "./marketplaceActionBands";

export function usePromotionDeals() {
  const [deals, setDeals] = useState<PromotionDeal[]>([]);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  useEffect(() => {
    migrateLegacyBandsToGlobalIfNeeded();
    const local = loadPromotionDeals();
    setDeals(local);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/marketplaces/promotion-deals", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { deals?: PromotionDeal[] };
        if (!Array.isArray(data.deals) || cancelled) return;
        if (data.deals.length > 0) {
          setDeals(data.deals);
          savePromotionDeals(data.deals);
        } else if (local.length > 0) {
          const put = await fetch("/api/marketplaces/promotion-deals", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deals: local }),
          });
          if (put.ok && !cancelled) {
            setRemoteError(null);
          }
        }
      } catch {
        /* offline: lokale Daten bleiben */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: PromotionDeal[]) => {
    setDeals(next);
    savePromotionDeals(next);
    try {
      const res = await fetch("/api/marketplaces/promotion-deals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deals: next }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setRemoteError(typeof j.error === "string" ? j.error : "Speichern fehlgeschlagen.");
      } else {
        setRemoteError(null);
      }
    } catch {
      setRemoteError("Netzwerkfehler beim Speichern (lokal gespeichert).");
    }
  }, []);

  return { deals, persist, remoteError };
}
