"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { Locale as DateFnsLocale } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MAX_ANALYTICS_RANGE_DAYS } from "@/shared/lib/analytics-date-range";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function inclusiveDayCount(fromYmd: string, toYmd: string): number {
  const a = parseYmdLocal(fromYmd);
  const b = parseYmdLocal(toYmd);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

function formatRangeShort(fromYmd: string, toYmd: string, dfLocale: DateFnsLocale): string {
  const a = parseYmdLocal(fromYmd);
  const b = parseYmdLocal(toYmd);
  if (fromYmd === toYmd) return format(a, "d. MMM yyyy", { locale: dfLocale });
  return `${format(a, "d. MMM", { locale: dfLocale })} - ${format(b, "d. MMM yyyy", { locale: dfLocale })}`;
}

export function AnalyticsMarketplacePeriodRangePicker({
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
          <Button type="button" variant="outline" size="sm" className="h-8 justify-start text-xs font-normal">
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5 opacity-70" />
            <span className="truncate">{formatRangeShort(periodFrom, periodTo, dfLocale)}</span>
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="range"
          locale={dfLocale}
          defaultMonth={parseYmdLocal(periodTo)}
          selected={selected}
          disabled={{ after: new Date() }}
          onSelect={(range) => {
            if (!range?.from || !range?.to) return;
            const from = toYmd(startOfLocalDay(range.from));
            const to = toYmd(startOfLocalDay(range.to));
            if (from > to) return;
            if (inclusiveDayCount(from, to) > MAX_ANALYTICS_RANGE_DAYS) return;
            onChange(from, to);
            setOpen(false);
          }}
          className={cn("p-2")}
        />
        <p className="border-t border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground">
          {t("dates.maxRangeHint", { max: String(MAX_ANALYTICS_RANGE_DAYS) })}
        </p>
      </PopoverContent>
    </Popover>
  );
}
