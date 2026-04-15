"use client";

import { useState } from "react";
import type { Locale as DateFnsLocale } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MAX_RANGE_DAYS,
  formatRangeShort,
  inclusiveDayCount,
  parseYmdLocal,
  startOfLocalDay,
  toYmd,
} from "@/shared/lib/marketplace-analytics-utils";

export function PeriodRangePicker({
  periodFrom,
  periodTo,
  onChange,
  dfLocale,
  t,
}: {
  periodFrom: string;
  periodTo: string;
  onChange: (from: string, to: string) => void;
  dfLocale: DateFnsLocale;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = useState(false);
  const selected: DateRange = {
    from: parseYmdLocal(periodFrom),
    to: parseYmdLocal(periodTo),
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs font-normal"
            aria-label={t("dates.periodAria")}
          />
        }
      >
        <CalendarIcon className="size-3.5 opacity-70" aria-hidden />
        <span className="max-w-[220px] truncate tabular-nums sm:max-w-none">
          {formatRangeShort(periodFrom, periodTo, dfLocale)}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-auto overflow-hidden p-0">
        <Calendar
          mode="range"
          locale={dfLocale}
          numberOfMonths={2}
          className="rounded-lg"
          defaultMonth={parseYmdLocal(periodTo)}
          selected={selected}
          disabled={{ after: new Date() }}
          onSelect={(range) => {
            if (!range?.from || !range?.to) return;
            const from = toYmd(startOfLocalDay(range.from));
            const to = toYmd(startOfLocalDay(range.to));
            if (from > to) return;
            if (inclusiveDayCount(from, to) > MAX_RANGE_DAYS) return;
            onChange(from, to);
            setOpen(false);
          }}
        />
        <p className="border-t border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground">
          {t("dates.maxRangeHint", { max: String(MAX_RANGE_DAYS) })}
        </p>
      </PopoverContent>
    </Popover>
  );
}
