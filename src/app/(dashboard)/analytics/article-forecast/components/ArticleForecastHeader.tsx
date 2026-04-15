"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";
import { useTranslation } from "@/i18n/I18nProvider";

export function ArticleForecastHeader({
  hasMounted,
  isBackgroundSyncing,
  onRefresh,
}: {
  hasMounted: boolean;
  isBackgroundSyncing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className={DASHBOARD_PAGE_TITLE}>{t("articleForecast.title")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={!hasMounted} onClick={onRefresh}>
            {t("articleForecast.refresh")}
          </Button>
          {isBackgroundSyncing ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("articleForecast.syncing")}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
