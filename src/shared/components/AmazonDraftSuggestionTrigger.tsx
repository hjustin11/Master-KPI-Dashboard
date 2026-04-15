"use client";

import { GitCompare, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  /** z. B. „Referenz Shopify", „Xentral", „Claude (claude-sonnet-4-5): Optimierter Titel" */
  sourceLabel: string;
  /** Anzeige Aktuell */
  currentText: string;
  /** Anzeige Vorschlag */
  proposedText: string;
  /** Warum das LLM diese Änderung vorschlägt (aus fields.[x].reason). */
  reason?: string;
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
  reason,
  onApply,
  disabled,
  className,
  ariaLabel = "Optimierung verfügbar — Vorschlag vergleichen",
}: Props) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        title="Optimierung verfügbar"
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          "border border-amber-400 bg-amber-50 text-amber-600",
          "shadow-sm shadow-amber-200/50",
          "hover:bg-amber-100 hover:text-amber-700 hover:border-amber-500",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
          "transition-colors",
          disabled && "pointer-events-none opacity-40",
          className
        )}
        aria-label={ariaLabel}
      >
        <GitCompare className="h-4 w-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(42rem,calc(100vw-2rem))] space-y-3 p-4 text-xs"
        align="start"
        side="bottom"
        sideOffset={6}
      >
        <p className="text-sm font-medium text-foreground">{sourceLabel}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Aktuell
            </div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed">
              {currentText.trim() ? currentText : "—"}
            </pre>
          </div>
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary/70">
              Vorschlag
            </div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed">
              {proposedText.trim() ? proposedText : "—"}
            </pre>
          </div>
        </div>
        {reason ? (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" aria-hidden />
              Begründung
            </div>
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/80">
              {reason}
            </p>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            className="h-8 px-4 text-xs font-medium"
            onClick={() => onApply()}
          >
            Übernehmen
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
