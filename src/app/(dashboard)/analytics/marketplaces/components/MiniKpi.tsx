"use client";

import { cn } from "@/lib/utils";
import { PLACEHOLDER, type TrendDirection } from "@/shared/lib/marketplace-sales-types";
import { TrendIcon } from "./MarketplaceAnalyticsTrendIcon";

export function MiniKpi({
  label,
  value,
  trendDirection = "unknown",
  previousValue,
  deltaPct,
  tooltip,
  compact = false,
  className,
}: {
  label: string;
  value: string;
  trendDirection?: TrendDirection;
  previousValue?: string;
  deltaPct?: string;
  tooltip?: string;
  compact?: boolean;
  className?: string;
}) {
  const showTrend =
    trendDirection !== "unknown" && trendDirection !== "flat" && value !== PLACEHOLDER;

  const deltaPctTrimmed = deltaPct?.trim() ?? "";
  const deltaIsPositive = deltaPctTrimmed.startsWith("+") || (/^\d/.test(deltaPctTrimmed) && !deltaPctTrimmed.startsWith("0"));
  const deltaIsNegative = deltaPctTrimmed.startsWith("−") || deltaPctTrimmed.startsWith("-");

  return (
    <div
      className={cn(
        "rounded-md border border-border/50 bg-background/60",
        compact ? "px-1.5 py-1" : "rounded-lg px-2 py-1.5",
        className
      )}
      title={tooltip}
    >
      <p
        className={cn(
          "font-medium uppercase tracking-wide text-muted-foreground",
          "text-[10px] leading-tight"
        )}
      >
        {label}
      </p>
      <div className="mt-0.5 flex items-center gap-1">
        {showTrend ? <TrendIcon compact={compact} direction={trendDirection} /> : null}
        <p
          className={cn(
            "tabular-nums font-semibold tracking-tight text-foreground",
            compact ? "text-xs" : "text-sm",
            showTrend && trendDirection === "up" && "text-emerald-700",
            showTrend && trendDirection === "down" && "text-rose-700"
          )}
        >
          {value}
        </p>
        {deltaPctTrimmed ? (
          <span
            className={cn(
              "ml-auto text-[10px] tabular-nums font-medium",
              deltaIsPositive && "text-emerald-600",
              deltaIsNegative && "text-rose-600",
              !deltaIsPositive && !deltaIsNegative && "text-muted-foreground"
            )}
          >
            {deltaPctTrimmed}
          </span>
        ) : null}
      </div>
      {previousValue ? (
        <p className="mt-0.5 text-[9px] tabular-nums text-muted-foreground">
          Vorperiode: {previousValue}
        </p>
      ) : null}
    </div>
  );
}
