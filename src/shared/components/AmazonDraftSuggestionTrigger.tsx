"use client";

import { GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  /** z. B. „Referenz Shopify“, „Xentral“, „Empfehlung“ */
  sourceLabel: string;
  /** Anzeige Aktuell */
  currentText: string;
  /** Anzeige Vorschlag */
  proposedText: string;
  onApply: () => void;
  disabled?: boolean;
  className?: string;
  /** aria-label für den Icon-Button */
  ariaLabel?: string;
};

export function AmazonDraftSuggestionTrigger({
  sourceLabel,
  currentText,
  proposedText,
  onApply,
  disabled,
  className,
  ariaLabel = "Vorschlag vergleichen",
}: Props) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
          disabled && "pointer-events-none opacity-40",
          className
        )}
        aria-label={ariaLabel}
      >
        <GitCompare className="h-3.5 w-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-[min(32rem,calc(100vw-2rem))] space-y-2 p-3 text-xs" align="start">
        <p className="font-medium text-foreground">{sourceLabel}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded border bg-muted/30 p-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Aktuell</div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-snug">
              {currentText.trim() ? currentText : "—"}
            </pre>
          </div>
          <div className="rounded border border-primary/25 bg-primary/5 p-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Vorschlag</div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-snug">
              {proposedText.trim() ? proposedText : "—"}
            </pre>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" size="sm" className="h-7 text-[11px]" onClick={() => onApply()}>
            Übernehmen
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
