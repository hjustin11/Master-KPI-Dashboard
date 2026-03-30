"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ANALYTICS_MARKETPLACES, getMarketplaceBySlug } from "@/shared/lib/analytics-marketplaces";
import { useTranslation } from "@/i18n/I18nProvider";
import {
  nextBandColor,
  type PromotionDeal,
} from "./marketplaceActionBands";

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function marketplaceLabel(slug: string | null, t: (k: string) => string): string {
  if (slug === null) return t("analyticsMp.promotionsAllMarketplaces");
  if (slug === "amazon") return "Amazon";
  return getMarketplaceBySlug(slug)?.label ?? slug;
}

const ALL_VALUE = "all";
const MARKETPLACE_SELECT_VALUES = [ALL_VALUE, "amazon", ...ANALYTICS_MARKETPLACES.map((m) => m.slug)] as const;

function DealColumn({
  title,
  items,
  t,
  onRemove,
}: {
  title: string;
  items: PromotionDeal[];
  t: (key: string, params?: Record<string, string | number>) => string;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border/50 bg-muted/10">
      <p className="border-b border-border/40 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="max-h-[min(55vh,420px)] space-y-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <li className="px-1 py-3 text-center text-[11px] text-muted-foreground">
            {t("analyticsMp.promotionsEmptyColumn")}
          </li>
        ) : (
          items.map((b) => (
            <li
              key={b.id}
              className="flex items-start justify-between gap-2 rounded-md border border-border/40 bg-background/80 px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border/50"
                    style={{ backgroundColor: b.color }}
                    aria-hidden
                  />
                  <span className="font-medium leading-tight">{b.label}</span>
                </span>
                <span className="mt-0.5 block pl-4 text-[10px] text-muted-foreground">
                  {b.from} – {b.to}
                </span>
                <span className="mt-0.5 block pl-4 text-[10px] text-primary/80">
                  {marketplaceLabel(b.marketplaceSlug, t)}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={t("analyticsChart.removeBandAria", { label: b.label })}
                onClick={() => onRemove(b.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function PromotionDealsDialog({
  open,
  onOpenChange,
  deals,
  onPersist,
  remoteError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deals: PromotionDeal[];
  onPersist: (next: PromotionDeal[]) => void | Promise<void>;
  remoteError: string | null;
}) {
  const { t } = useTranslation();
  const today = todayYmd();
  const [draft, setDraft] = useState({
    label: "",
    from: today,
    to: today,
    color: "#f97316",
    marketplace: ALL_VALUE,
  });

  const { running, upcoming, past } = useMemo(() => {
    const runningL: PromotionDeal[] = [];
    const upcomingL: PromotionDeal[] = [];
    const pastL: PromotionDeal[] = [];
    for (const d of deals) {
      if (d.from <= today && d.to >= today) runningL.push(d);
      else if (d.from > today) upcomingL.push(d);
      else pastL.push(d);
    }
    upcomingL.sort((a, b) => a.from.localeCompare(b.from));
    pastL.sort((a, b) => b.to.localeCompare(a.to));
    return { running: runningL, upcoming: upcomingL, past: pastL };
  }, [deals, today]);

  const addDeal = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let from = draft.from;
    let to = draft.to;
    if (from > to) [from, to] = [to, from];
    const marketplaceSlug = draft.marketplace === ALL_VALUE ? null : draft.marketplace;
    const next: PromotionDeal = {
      id,
      label: draft.label.trim() || t("analyticsChart.defaultBandLabel"),
      from,
      to,
      color: draft.color || nextBandColor(deals),
      marketplaceSlug,
    };
    void onPersist([...deals, next]);
    setDraft((d) => ({ ...d, label: "", color: nextBandColor([...deals, next]) }));
  };

  const remove = (id: string) => {
    void onPersist(deals.filter((x) => x.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(96vh,980px)] max-w-[calc(100%-1.25rem)] gap-0 overflow-y-auto p-0 sm:max-w-6xl">
        <DialogHeader className="border-b border-border/60 px-4 pb-3 pt-4 text-left">
          <DialogTitle>{t("analyticsMp.promotionsTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4">
          {remoteError ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-900">
              {remoteError}
            </p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <DealColumn
              title={t("analyticsMp.promotionsRunning")}
              items={running}
              t={t}
              onRemove={remove}
            />
            <DealColumn
              title={t("analyticsMp.promotionsUpcoming")}
              items={upcoming}
              t={t}
              onRemove={remove}
            />
            <DealColumn
              title={t("analyticsMp.promotionsPast")}
              items={past}
              t={t}
              onRemove={remove}
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("analyticsMp.promotionsNewDeal")}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
              <div className="space-y-1.5 lg:col-span-4">
                <Label htmlFor="promo-label" className="text-xs">
                  {t("analyticsChart.labelField")}
                </Label>
                <Input
                  id="promo-label"
                  value={draft.label}
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                  placeholder={t("analyticsChart.labelPlaceholder")}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="promo-from" className="text-xs">
                  {t("dates.from")}
                </Label>
                <Input
                  id="promo-from"
                  type="date"
                  value={draft.from}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="promo-to" className="text-xs">
                  {t("dates.to")}
                </Label>
                <Input
                  id="promo-to"
                  type="date"
                  value={draft.to}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-xs">{t("analyticsMp.promotionsMarketplace")}</Label>
                <Select
                  value={draft.marketplace}
                  onValueChange={(v) => {
                    if (v) setDraft((d) => ({ ...d, marketplace: v }));
                  }}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETPLACE_SELECT_VALUES.map((val) => (
                      <SelectItem key={val} value={val}>
                        {val === ALL_VALUE
                          ? t("analyticsMp.promotionsAllMarketplaces")
                          : val === "amazon"
                            ? "Amazon"
                            : getMarketplaceBySlug(val)?.label ?? val}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 lg:col-span-1">
                <Label htmlFor="promo-color" className="text-xs">
                  {t("analyticsChart.color")}
                </Label>
                <Input
                  id="promo-color"
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="h-9 w-full cursor-pointer py-1"
                />
              </div>
              <div className="lg:col-span-1">
                <Button type="button" className="w-full" size="sm" onClick={addDeal}>
                  {t("analyticsMp.promotionsAdd")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
