"use client";

import { ArrowRight } from "lucide-react";
import { MarketplaceBrandImg } from "@/shared/components/MarketplaceBrandImg";
import {
  MARKETPLACE_TILE_BTN_CLASS,
  MARKETPLACE_TILE_KPI_GRID_CLASS,
  MARKETPLACE_TILE_LOGO,
  PLACEHOLDER,
  type MarketplaceTileLogoPreset,
  type TrendDirection,
} from "@/shared/lib/marketplace-sales-types";
import { kpiLabelsForPeriod } from "@/shared/lib/marketplace-analytics-utils";
import { MiniKpi } from "./MiniKpi";
import { MarketplaceTileKpis } from "./MarketplaceTileKpis";

export type MarketplaceTileSummary = {
  salesAmount: number;
  orderCount: number;
  units: number;
  currency: string;
};

export function MarketplaceTile({
  label,
  logoSrc,
  logoPreset,
  summary,
  previousSummary,
  trend,
  periodKpis,
  intlTag,
  loading,
  error,
  onOpenDetail,
}: {
  label: string;
  logoSrc: string;
  logoPreset: MarketplaceTileLogoPreset;
  summary: MarketplaceTileSummary | null | undefined;
  previousSummary: MarketplaceTileSummary | null | undefined;
  trend: { text: string; direction: TrendDirection };
  periodKpis: ReturnType<typeof kpiLabelsForPeriod>;
  intlTag: string;
  loading: boolean;
  error?: string | null;
  onOpenDetail: () => void;
}) {
  const logo = MARKETPLACE_TILE_LOGO[logoPreset];
  return (
    <button type="button" onClick={onOpenDetail} className={MARKETPLACE_TILE_BTN_CLASS}>
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className={logo.slot}>
            <MarketplaceBrandImg src={logoSrc} alt={label} className={logo.img} />
          </div>
        </div>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
          <ArrowRight className="h-3 w-3" aria-hidden />
        </span>
      </div>

      {error ? (
        <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-900">
          {error}
        </p>
      ) : null}

      {loading && !summary ? (
        <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : summary ? (
        <MarketplaceTileKpis
          summary={summary}
          previousSummary={previousSummary}
          trend={trend}
          periodKpis={periodKpis}
          intlTag={intlTag}
        />
      ) : (
        <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
          <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
          <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
          <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
          <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
        </div>
      )}
    </button>
  );
}
