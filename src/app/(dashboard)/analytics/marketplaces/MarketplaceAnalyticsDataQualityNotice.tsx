"use client";

import { CircleAlert } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function MarketplaceAnalyticsDataQualityNotice({ t }: Props) {
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={t("analyticsMp.dataQualityNoticeAria")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/[0.14] px-2.5 py-1 text-xs font-semibold text-amber-950 shadow-sm outline-none transition-colors",
                "hover:bg-amber-500/22 focus-visible:ring-2 focus-visible:ring-amber-500/45",
                "dark:border-amber-400/45 dark:bg-amber-950/50 dark:text-amber-50 dark:hover:bg-amber-950/70"
              )}
            />
          }
        >
          <CircleAlert className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
          {t("analyticsMp.dataQualityNoticeLabel")}
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
          className={cn(
            "flex w-[min(24rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] flex-col items-start gap-1.5 p-3 text-xs shadow-lg",
            "border border-amber-300/60 bg-popover text-popover-foreground"
          )}
        >
          <p className="font-semibold leading-snug text-popover-foreground">
            {t("analyticsMp.dataQualityNoticeTitle")}
          </p>
          <p className="leading-relaxed text-popover-foreground/90">
            {t("analyticsMp.dataQualityNoticeBody")}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
