"use client";

import { Bug } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { PriceParityColumnApiDoc } from "@/shared/lib/priceParityDataSourceMeta";

type ApiDataSourceDebugPopoverProps = {
  show: boolean;
  doc: PriceParityColumnApiDoc;
  /** z. B. Spaltenkopf — für aria-label */
  ariaLabel?: string;
  className?: string;
};

/**
 * Kompaktes Entwickler-Symbol: Quelle + technische API-Kennung.
 * Nur rendern, wenn `show` true (Rolle Entwickler — `useShowApiSourceDebug()`).
 */
export function ApiDataSourceDebugPopover({
  show,
  doc,
  ariaLabel = "Datenquelle (nur Rolle Entwickler)",
  className,
}: ApiDataSourceDebugPopoverProps) {
  if (!show) return null;

  const summary = `${doc.source}: ${doc.apiId}`;

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        title={summary}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground/80 outline-none transition-colors hover:border-border/60 hover:bg-muted/50 hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Bug className="size-3" strokeWidth={2} aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="w-[min(calc(100vw-2rem),18rem)] border-border/80 p-3 text-xs shadow-lg"
      >
        <p className="mb-2 border-b border-border/60 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          Rolle Entwickler · Datenquelle
        </p>
        <p className="break-all font-mono text-[11px] font-medium leading-snug text-foreground">{summary}</p>
        {doc.route ? (
          <p className="mt-2 break-all font-mono text-[10px] leading-snug text-muted-foreground">{doc.route}</p>
        ) : null}
        {doc.hint ? (
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{doc.hint}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
