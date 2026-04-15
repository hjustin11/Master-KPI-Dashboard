"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/i18n/I18nProvider";

export function ArticleForecastAlerts({
  error,
  salesAggError,
  isLoading,
  windowWarning,
  onRetrySalesAgg,
}: {
  error: string | null;
  salesAggError: boolean;
  isLoading: boolean;
  windowWarning: string | null;
  onRetrySalesAgg: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {salesAggError && !isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{t("articleForecast.salesLoadError")}</span>
          <button
            type="button"
            className="shrink-0 text-xs underline underline-offset-2 hover:no-underline"
            onClick={onRetrySalesAgg}
          >
            {t("commonUi.retry")}
          </button>
        </div>
      ) : null}

      {windowWarning ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-950">
          {windowWarning}
        </div>
      ) : null}
    </>
  );
}
