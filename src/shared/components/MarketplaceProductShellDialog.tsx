"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import { Loader2 } from "lucide-react";

export type MarketplaceProductShellMode = "create" | "edit";

export type MarketplaceProductShellDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: MarketplaceProductShellMode;
  /** Bestehende Zeile (Bearbeiten); bei Anlegen leer bzw. Platzhalter. */
  row: MarketplaceProductListRow | null;
  /** Anzeigename des Marktplatzes (z. B. „Otto“, „Kaufland“). */
  marketplaceLabel: string;
  /**
   * Relativer Pfad zur Produktlisten-API (z. B. `/api/kaufland/products`).
   * Beim Bearbeiten wird einmal geladen, um den aktuellen API-Datensatz zur SKU anzuzeigen.
   */
  productsListApiUrl?: string | null;
};

function normSkuKey(s: string) {
  return s.trim().toLowerCase();
}

function formatJsonCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function MarketplaceProductShellDialog({
  open,
  onOpenChange,
  mode,
  row,
  marketplaceLabel,
  productsListApiUrl,
}: MarketplaceProductShellDialogProps) {
  const { t, locale } = useTranslation();
  const intlTag = intlLocaleTag(locale);
  const isEdit = mode === "edit" && row != null;
  const [createSku, setCreateSku] = useState("");
  const [createSecondaryId, setCreateSecondaryId] = useState("");
  const [createTitle, setCreateTitle] = useState("");

  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiRecord, setApiRecord] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (open && mode === "create") {
      setCreateSku("");
      setCreateSecondaryId("");
      setCreateTitle("");
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open || !isEdit || !row?.sku || !productsListApiUrl?.trim()) {
      setApiRecord(null);
      setApiError(null);
      setApiLoading(false);
      return;
    }
    const ac = new AbortController();
    setApiLoading(true);
    setApiError(null);
    setApiRecord(null);
    const url = productsListApiUrl.trim().startsWith("http")
      ? productsListApiUrl.trim()
      : `${typeof window !== "undefined" ? window.location.origin : ""}${productsListApiUrl.trim()}`;
    void (async () => {
      try {
        const res = await fetch(url, { cache: "no-store", signal: ac.signal });
        const json = (await res.json().catch(() => ({}))) as {
          items?: Array<Record<string, unknown>>;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? t("marketplaceProducts.productShell.apiDetailError"));
        }
        const items = Array.isArray(json.items) ? json.items : [];
        const want = normSkuKey(row.sku);
        const found =
          items.find((it) => normSkuKey(String(it.sku ?? "")) === want) ??
          items.find((it) => normSkuKey(String(it.shop_sku ?? it.shopSku ?? "")) === want);
        setApiRecord(found ?? null);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setApiError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      } finally {
        if (!ac.signal.aborted) setApiLoading(false);
      }
    })();
    return () => ac.abort();
  }, [open, isEdit, row?.sku, productsListApiUrl, t]);

  const listPrice = useMemo(() => {
    if (!row) return null;
    const r = row as Record<string, unknown>;
    const p =
      row.priceEur ??
      (typeof r.price === "number" && Number.isFinite(r.price) ? r.price : null) ??
      (typeof r.price === "string" ? Number(r.price) : null);
    if (p == null || !Number.isFinite(p)) return null;
    return p;
  }, [row]);

  const listStock = row?.stockQty;

  const apiRows = useMemo(() => {
    if (!apiRecord) return [];
    return Object.entries(apiRecord)
      .map(([key, value]) => ({ key, value: formatJsonCell(value) }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [apiRecord]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(42rem,calc(100vw-1.25rem))] max-w-[calc(100%-1rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("marketplaceProducts.productShell.editTitle", { marketplace: marketplaceLabel })
              : t("marketplaceProducts.productShell.createTitle", { marketplace: marketplaceLabel })}
          </DialogTitle>
          <DialogDescription>
            {t("marketplaceProducts.productShell.description", { marketplace: marketplaceLabel })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("marketplaceProducts.productShell.stammdatenSection")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">{t("marketplaceProducts.sku")}</span>
                <Input
                  readOnly={isEdit}
                  value={isEdit ? row.sku : createSku}
                  onChange={(e) => setCreateSku(e.target.value)}
                  placeholder={isEdit ? "—" : t("marketplaceProducts.productShell.createSkuPlaceholder")}
                  className={isEdit ? "bg-muted/40" : undefined}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">{t("marketplaceProducts.secondaryId")}</span>
                <Input
                  readOnly={isEdit}
                  value={isEdit ? row.secondaryId : createSecondaryId}
                  onChange={(e) => setCreateSecondaryId(e.target.value)}
                  placeholder={isEdit ? "—" : t("marketplaceProducts.productShell.createIdPlaceholder")}
                  className={isEdit ? "bg-muted/40" : undefined}
                />
              </label>
            </div>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{t("marketplaceProducts.articleName")}</span>
              <Input
                readOnly={isEdit}
                value={isEdit ? row.title : createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder={isEdit ? "—" : t("marketplaceProducts.productShell.createTitlePlaceholder")}
                className={isEdit ? "bg-muted/40" : undefined}
              />
            </label>
            {isEdit ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("marketplaceProducts.status")}</span>
                <Badge variant={row.isActive ? "default" : "secondary"}>
                  {row.isActive ? t("marketplaceProducts.active") : t("marketplaceProducts.inactive")}
                </Badge>
              </div>
            ) : null}
          </div>

          {isEdit ? (
            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/15 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("marketplaceProducts.productShell.listFieldsSection")}
              </p>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t("marketplaceProducts.productShell.listFieldStatusLabel")}</dt>
                  <dd className="font-medium">{row.statusLabel || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("marketplaceProducts.productShell.listFieldPriceEur")}</dt>
                  <dd className="font-medium tabular-nums">
                    {listPrice != null
                      ? new Intl.NumberFormat(intlTag, {
                          style: "currency",
                          currency: "EUR",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(listPrice)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("marketplaceProducts.productShell.listFieldStockQty")}</dt>
                  <dd className="font-medium tabular-nums">
                    {listStock != null && Number.isFinite(listStock)
                      ? new Intl.NumberFormat(intlTag, { maximumFractionDigits: 0 }).format(listStock)
                      : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          {isEdit && productsListApiUrl ? (
            <div className="space-y-2 rounded-lg border border-border/70 bg-card/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("marketplaceProducts.productShell.apiDetailSection")}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("marketplaceProducts.productShell.apiDetailNote")}
              </p>
              {apiLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("marketplaceProducts.productShell.apiDetailLoading")}
                </div>
              ) : null}
              {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
              {!apiLoading && !apiError && apiRecord == null ? (
                <p className="text-sm text-muted-foreground">{t("marketplaceProducts.productShell.apiDetailEmpty")}</p>
              ) : null}
              {apiRows.length > 0 ? (
                <div className="max-h-52 overflow-auto rounded-md border border-border/60">
                  <table className="w-full text-left text-[11px]">
                    <tbody>
                      {apiRows.map(({ key, value }) => (
                        <tr key={key} className="border-b border-border/40 last:border-0">
                          <th className="w-[36%] whitespace-normal break-words px-2 py-1.5 align-top font-medium text-muted-foreground">
                            {key}
                          </th>
                          <td className="whitespace-pre-wrap break-all px-2 py-1.5 align-top font-mono text-[10px]">
                            {value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground">
              {t("marketplaceProducts.productShell.marketplaceFieldsTitle", { marketplace: marketplaceLabel })}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("marketplaceProducts.productShell.marketplaceFieldsHint", { marketplace: marketplaceLabel })}
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:gap-0">
          <p className="text-xs text-muted-foreground">{t("marketplaceProducts.productShell.footerHint")}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("commonUi.close")}
            </Button>
            <Button type="button" disabled title={t("marketplaceProducts.productShell.saveDisabledTitle")}>
              {t("marketplaceProducts.productShell.saveToMarketplace")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
