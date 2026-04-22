"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import type { WeeklyReportNarrative } from "@/shared/lib/weeklyReport/weeklyReportService";

export type WeeklyReportStoryProps = {
  narrative: WeeklyReportNarrative;
};

export function WeeklyReportStory({ narrative }: WeeklyReportStoryProps) {
  const { t } = useTranslation();
  const segments =
    narrative.segments.length > 0
      ? narrative.segments
      : [{ type: "text" as const, value: t("weeklyReport.story.fallback") }];

  return (
    <div className="rounded-xl border bg-card px-6 py-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("weeklyReport.story.kernaussage")}
      </div>
      <div className="mt-2 text-lg leading-relaxed text-foreground">
        {segments.map((seg, i) => {
          if (seg.type === "text") return <span key={i}>{seg.value}</span>;
          const trendClass =
            seg.trend === "up"
              ? "text-emerald-600 dark:text-emerald-400"
              : seg.trend === "down"
                ? "text-red-600 dark:text-red-400"
                : "text-foreground";
          return (
            <span key={i} className={cn("font-semibold", trendClass)}>
              {seg.value}
            </span>
          );
        })}
      </div>
    </div>
  );
}
