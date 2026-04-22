"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { DASHBOARD_PAGE_SHELL } from "@/shared/lib/dashboardUi";
import { useTranslation } from "@/i18n/I18nProvider";
import useWeeklyReport from "@/shared/hooks/useWeeklyReport";
import { WeeklyReportHeader } from "./components/WeeklyReportHeader";
import { WeeklyReportStory } from "./components/WeeklyReportStory";
import { WeeklyReportSummaryGrid } from "./components/WeeklyReportSummaryGrid";
import { WeeklyReportTable } from "./components/WeeklyReportTable";

export default function AnalyticsWeeklyReportPage() {
  const { t } = useTranslation();
  const { data, loading, error, selectedWeek, availableWeeks, setSelectedWeek } = useWeeklyReport();

  const handleExport = useCallback(() => {
    const url = `/api/analytics/weekly-report/export?year=${selectedWeek.year}&week=${selectedWeek.week}`;
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      toast.error(t("weeklyReport.exportError"));
      return;
    }
    toast.success(t("weeklyReport.exportSuccess"));
  }, [selectedWeek, t]);

  const previousWeek = data?.weeks.previous ?? availableWeeks[1] ?? selectedWeek;

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <WeeklyReportHeader
        currentWeek={selectedWeek}
        previousWeek={previousWeek}
        availableWeeks={availableWeeks}
        onWeekChange={setSelectedWeek}
        onExport={handleExport}
        exportDisabled={loading || !data}
      />

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-100">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="rounded-md border border-border/60 bg-background px-4 py-10 text-center text-sm text-muted-foreground">
          {t("weeklyReport.loading")}
        </div>
      ) : data ? (
        <>
          <WeeklyReportStory narrative={data.narrative} />
          <WeeklyReportSummaryGrid totals={data.totals} />
          <WeeklyReportTable
            marketplaces={data.marketplaces}
            weekNumber={data.weeks.current.week}
            isoYear={data.weeks.current.year}
          />
        </>
      ) : !error ? (
        <div className="rounded-md border border-dashed border-border/60 bg-background px-4 py-10 text-center text-sm text-muted-foreground">
          {t("weeklyReport.story.fallback")}
        </div>
      ) : null}
    </div>
  );
}
