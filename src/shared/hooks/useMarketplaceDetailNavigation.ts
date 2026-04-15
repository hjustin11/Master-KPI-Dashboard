"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MARKETPLACE_DETAIL_ORDER,
  type MarketplaceDetailId,
} from "@/shared/lib/marketplace-sales-types";

export default function useMarketplaceDetailNavigation() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailIndex, setDetailIndex] = useState(0);

  const stepDetail = useCallback((delta: -1 | 1) => {
    setDetailIndex(
      (i) => (i + delta + MARKETPLACE_DETAIL_ORDER.length) % MARKETPLACE_DETAIL_ORDER.length
    );
  }, []);

  const openDetailAt = useCallback((id: MarketplaceDetailId) => {
    const idx = MARKETPLACE_DETAIL_ORDER.indexOf(id);
    setDetailIndex(idx >= 0 ? idx : 0);
    setDetailOpen(true);
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepDetail(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        stepDetail(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen, stepDetail]);

  return { detailOpen, setDetailOpen, detailIndex, stepDetail, openDetailAt };
}
