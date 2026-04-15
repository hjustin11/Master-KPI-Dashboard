"use client";

import { useTranslation } from "@/i18n/I18nProvider";
import type { PromotionDeal } from "../../marketplaces/marketplaceActionBands";
import type { ArticlesResponseMeta } from "@/shared/lib/article-forecast-utils";

export function ArticleForecastMetaBanner({
  meta,
  isLoading,
  fromYmd,
  toYmd,
  relevantDeals,
}: {
  meta: ArticlesResponseMeta | null;
  isLoading: boolean;
  fromYmd: string;
  toYmd: string;
  relevantDeals: PromotionDeal[];
}) {
  const { t } = useTranslation();
  return (
    <>
      {meta?.salesWindow && !isLoading ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            {t("articleForecast.metaWindow", {
              from: meta.salesWindow.fromYmd ?? fromYmd,
              to: meta.salesWindow.toYmd ?? toYmd,
            })}
          </span>
          <span>
            {t("articleForecast.metaNotes", {
              notes: String(meta.salesWindow.deliveryNotesInWindow ?? 0),
              lines: String(meta.salesWindow.lineItemsParsed ?? 0),
            })}
          </span>
          <span>
            {meta.salesWindow.source === "v3_delivery_notes" ? "v3" : "v1"}
            {meta.salesWindow.cacheDaysUsed
              ? ` + Cache (${meta.salesWindow.cacheDaysUsed}d)`
              : ""}
          </span>
        </div>
      ) : null}

      {relevantDeals.length > 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-3">
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">
            {t("articleForecast.activeDeals", { count: String(relevantDeals.length) })}
          </h4>
          <div className="flex flex-wrap gap-2">
            {relevantDeals.map((deal) => (
              <span
                key={deal.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-xs"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: deal.color }} />
                {deal.label} · {deal.from} — {deal.to}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
