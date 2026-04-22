"use client";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/I18nProvider";
import type {
  WeeklyMarketplaceData,
  WeeklyTopSku,
} from "@/shared/lib/weeklyReport/weeklyReportService";

const fmtEur = (v: number) => `${Math.round(v).toLocaleString("de-DE")} €`;
const fmtInt = (v: number) => v.toLocaleString("de-DE");
const fmtDeltaPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;

function Row({ item, rank, positive }: { item: WeeklyTopSku; rank: number; positive: boolean }) {
  const colorClass = positive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-2 text-xs font-semibold tabular-nums text-muted-foreground">#{rank}</td>
      <td className="px-3 py-2">
        <div className="font-mono text-xs font-semibold text-foreground">{item.sku}</div>
        {item.name && item.name !== item.sku ? (
          <div className="truncate text-[11px] text-muted-foreground">{item.name}</div>
        ) : null}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtEur(item.revenueCurrent)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtEur(item.revenuePrevious)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtInt(item.ordersCurrent)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtInt(item.ordersPrevious)}</td>
      <td className={cn("px-3 py-2 text-right text-sm font-semibold tabular-nums", colorClass)}>
        {fmtDeltaPct(item.deltaPercent)}
      </td>
    </tr>
  );
}

function SkuTable({ items, positive }: { items: WeeklyTopSku[]; positive: boolean }) {
  if (items.length === 0) return null;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <th className="px-3 py-2">#</th>
          <th className="px-3 py-2">SKU</th>
          <th className="px-3 py-2 text-right">Umsatz</th>
          <th className="px-3 py-2 text-right">Vorwoche</th>
          <th className="px-3 py-2 text-right">Best.</th>
          <th className="px-3 py-2 text-right">Best. Vw.</th>
          <th className="px-3 py-2 text-right">Delta</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <Row key={item.sku} item={item} rank={idx + 1} positive={positive} />
        ))}
      </tbody>
    </table>
  );
}

export type WeeklyReportTopSkuDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  marketplace: WeeklyMarketplaceData;
  weekNumber?: number;
};

export function WeeklyReportTopSkuDialog({
  open,
  onOpenChange,
  marketplace,
  weekNumber,
}: WeeklyReportTopSkuDialogProps) {
  const { t } = useTranslation();
  const gainers = marketplace.topGainers;
  const losers = marketplace.topLosers;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {t("weeklyReport.details.dialogTitle", { name: marketplace.name })}
          </DialogTitle>
          <DialogDescription>
            KW {weekNumber ?? "—"} · Alle qualifizierten SKUs (Mindest-Umsatz 50 €)
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] gap-6 overflow-y-auto md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {t("weeklyReport.details.dialogGainersHeading", { count: String(gainers.length) })}
            </div>
            {gainers.length > 0 ? (
              <SkuTable items={gainers} positive />
            ) : (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("weeklyReport.details.noGainers")}
              </div>
            )}
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              {t("weeklyReport.details.dialogLosersHeading", { count: String(losers.length) })}
            </div>
            {losers.length > 0 ? (
              <SkuTable items={losers} positive={false} />
            ) : (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("weeklyReport.details.noLosers")}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
