"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  MarketplaceReportPrintView,
  type MarketplaceReportRow,
} from "../MarketplaceReportPrintView";

export type PdfReportMode = "all" | "single" | "selected";

export function PdfReportDialog({
  open,
  onOpenChange,
  reportMode,
  onReportModeChange,
  reportMarketplaceId,
  onReportMarketplaceIdChange,
  reportSelectedIds,
  onReportSelectedIdsChange,
  reportRows,
  activeReportRows,
  periodFrom,
  periodTo,
  intlTag,
  onPrint,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reportMode: PdfReportMode;
  onReportModeChange: (mode: PdfReportMode) => void;
  reportMarketplaceId: string;
  onReportMarketplaceIdChange: (id: string) => void;
  reportSelectedIds: string[];
  onReportSelectedIdsChange: (ids: string[]) => void;
  reportRows: MarketplaceReportRow[];
  activeReportRows: MarketplaceReportRow[];
  periodFrom: string;
  periodTo: string;
  intlTag: string;
  onPrint: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100%-1rem)] w-full overflow-y-auto p-0 sm:max-w-5xl">
        <div className="space-y-3 p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">PDF-Bericht: Marktplatz-Vergleich</h2>
            <Button type="button" onClick={onPrint}>
              Als PDF drucken
            </Button>
          </div>
          <div className="grid gap-3 rounded-lg border border-border/50 bg-muted/10 p-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <label className="space-y-1 text-xs">
              <span>Berichtsmodus</span>
              <select
                value={reportMode}
                onChange={(event) => onReportModeChange(event.target.value as PdfReportMode)}
                className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5 text-sm"
              >
                <option value="all">Alle Marktplätze</option>
                <option value="single">Einzel-Marktplatz</option>
                <option value="selected">Ausgewählte Marktplätze</option>
              </select>
            </label>
            {reportMode === "single" ? (
              <label className="space-y-1 text-xs">
                <span>Marktplatz</span>
                <select
                  value={reportMarketplaceId}
                  onChange={(event) => onReportMarketplaceIdChange(event.target.value)}
                  className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5 text-sm"
                >
                  {reportRows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : reportMode === "selected" ? (
              <div className="space-y-1 text-xs">
                <span>Marktplätze auswählen</span>
                <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-border/50 bg-background p-2 text-sm">
                  {reportRows.map((row) => {
                    const checked = reportSelectedIds.includes(row.id);
                    return (
                      <label key={row.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...reportSelectedIds, row.id]
                              : reportSelectedIds.filter((id) => id !== row.id);
                            onReportSelectedIdsChange(next);
                          }}
                        />
                        <span>{row.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground md:self-end">
                Es werden alle Marktplätze als separierte Abschnitte exportiert.
              </p>
            )}
          </div>
          <MarketplaceReportPrintView
            rows={activeReportRows}
            periodFrom={periodFrom}
            periodTo={periodTo}
            mode={reportMode}
            generatedAt={new Date()}
            intlTag={intlTag}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
