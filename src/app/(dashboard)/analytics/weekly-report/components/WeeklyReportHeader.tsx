"use client";

import { CalendarDays, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/i18n/I18nProvider";
import type { IsoWeek } from "@/shared/lib/weeklyReport/isoWeekResolver";
import { isoWeekFromKey } from "@/shared/hooks/useWeeklyReport";

function formatRange(start: Date, end: Date, locale: string): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "2-digit" });
  const fullFmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
  if (sameMonth) {
    return `${dayFmt.format(start)}.–${fullFmt.format(end)}`;
  }
  return `${fullFmt.format(start)} – ${fullFmt.format(end)}`;
}

export type WeeklyReportHeaderProps = {
  currentWeek: IsoWeek;
  previousWeek: IsoWeek;
  availableWeeks: IsoWeek[];
  onWeekChange: (week: IsoWeek) => void;
  onExport: () => void;
  exportDisabled?: boolean;
};

export function WeeklyReportHeader({
  currentWeek,
  previousWeek,
  availableWeeks,
  onWeekChange,
  onExport,
  exportDisabled,
}: WeeklyReportHeaderProps) {
  const { t, locale } = useTranslation();
  const intlLocale = locale === "de" ? "de-DE" : locale === "zh" ? "zh-CN" : "en-US";

  const currentRange = formatRange(currentWeek.start, currentWeek.end, intlLocale);
  const previousRange = formatRange(previousWeek.start, previousWeek.end, intlLocale);

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm">
          <CalendarDays className="h-3 w-3" aria-hidden />
          {t("weeklyReport.title")} · {t("weeklyReport.subtitle")}
        </div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">
          {t("weeklyReport.headerTitle", {
            currentWeek: String(currentWeek.week),
            previousWeek: String(previousWeek.week),
          })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("weeklyReport.headerRange", { currentRange, previousRange })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={currentWeek.key}
          onValueChange={(value) => {
            if (!value) return;
            const w = isoWeekFromKey(value);
            if (w) onWeekChange(w);
          }}
        >
          <SelectTrigger
            className="h-9 w-[180px]"
            aria-label={t("weeklyReport.weekDropdownLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableWeeks.map((w) => (
              <SelectItem key={w.key} value={w.key}>
                {t("weeklyReport.weekOptionLabel", { week: String(w.week), year: String(w.year) })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={exportDisabled}
          className="gap-1.5"
        >
          <FileDown className="h-3.5 w-3.5" aria-hidden />
          {t("weeklyReport.exportPdf")}
        </Button>
      </div>
    </header>
  );
}
