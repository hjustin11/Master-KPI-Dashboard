"use client";

import { useEffect, useRef, useState } from "react";
import {
  TOTAL_STRIP_MAX_BLOCK_MS,
  defaultPeriod,
} from "@/shared/lib/marketplace-analytics-utils";

export default function useMarketplacePeriod() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [forceUnblockTotalStrip, setForceUnblockTotalStrip] = useState(false);
  const periodRef = useRef(period);

  useEffect(() => {
    periodRef.current = period;
  }, [period]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on period change
    setForceUnblockTotalStrip(false);
    const id = window.setTimeout(() => {
      setForceUnblockTotalStrip(true);
    }, TOTAL_STRIP_MAX_BLOCK_MS);
    return () => window.clearTimeout(id);
  }, [period.from, period.to]);

  return { period, setPeriod, periodRef, forceUnblockTotalStrip };
}
