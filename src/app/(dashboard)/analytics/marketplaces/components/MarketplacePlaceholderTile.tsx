"use client";

import { ArrowRight } from "lucide-react";
import { MarketplaceBrandImg } from "@/shared/components/MarketplaceBrandImg";
import {
  MARKETPLACE_TILE_BTN_CLASS,
  MARKETPLACE_TILE_KPI_GRID_CLASS,
  MARKETPLACE_TILE_LOGO,
  PLACEHOLDER,
  placeholderTileLogoPreset,
} from "@/shared/lib/marketplace-sales-types";
import { MiniKpi } from "./MiniKpi";

export function PlaceholderTile({
  label,
  logo,
  onOpenDetail,
  t,
}: {
  label: string;
  logo: string;
  onOpenDetail: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const { slot, img } = MARKETPLACE_TILE_LOGO[placeholderTileLogoPreset()];
  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className={MARKETPLACE_TILE_BTN_CLASS}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className={slot}>
            <MarketplaceBrandImg src={logo} alt={label} className={img} />
          </div>
        </div>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
          <ArrowRight className="h-3 w-3" aria-hidden />
        </span>
      </div>

      <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
        <MiniKpi compact label={t("analyticsMp.revenue7d")} value={PLACEHOLDER} />
        <MiniKpi compact label={t("analyticsMp.orders")} value={PLACEHOLDER} />
        <MiniKpi compact label={t("analyticsMp.units")} value={PLACEHOLDER} />
        <MiniKpi compact label={t("analyticsMp.tileTrend")} value={PLACEHOLDER} />
      </div>
    </button>
  );
}
