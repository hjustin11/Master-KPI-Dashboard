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
import { MarketplaceProductEditorDialogContent } from "@/shared/components/MarketplaceProductEditorDialogContent";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import {
  MARKETPLACE_PRODUCT_EDITOR_BODY_PADDING_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_CONTROL,
  MARKETPLACE_PRODUCT_EDITOR_FIELD,
  MARKETPLACE_PRODUCT_EDITOR_FOOTER_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_HEADER_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_HINT,
  MARKETPLACE_PRODUCT_EDITOR_H3,
  MARKETPLACE_PRODUCT_EDITOR_LABEL,
  MARKETPLACE_PRODUCT_EDITOR_LOGO_IMG_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_LOGO_WRAP_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_SCROLL_OUTER_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_SECTION,
  MARKETPLACE_PRODUCT_EDITOR_TITLE_CLASS,
} from "@/shared/lib/marketplaceProductEditorTokens";
import {
  displayRowFromApi,
  extrasKeysForTechnicalTable,
  resolveShellLayout,
  type ShellFieldFormat,
} from "@/shared/lib/marketplaceProductShellLayout";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import { cn } from "@/lib/utils";
import { Download, Loader2, Maximize2 } from "lucide-react";

export type MarketplaceProductShellMode = "create" | "edit";

export type MarketplaceProductShellDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: MarketplaceProductShellMode;
  row: MarketplaceProductListRow | null;
  marketplaceLabel: string;
  /** z. B. `shopify`, `ebay` – steuert Kachel-Felder aus `extras`. */
  marketplaceSlug: string;
  logoSrc: string;
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

function formatShellFieldValue(
  value: unknown,
  format: ShellFieldFormat | undefined,
  intlTag: string
): string {
  if (value === null || value === undefined) return "—";
  if (format === "boolean") return value ? "✓" : "—";
  if (format === "integer") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? String(Math.trunc(n)) : "—";
  }
  if (format === "currencyEur") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "—";
    return new Intl.NumberFormat(intlTag, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  return s || "—";
}

function isLikelyImageUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^data:image\//i.test(v)) return true;
  try {
    const url = new URL(v);
    if (!/^https?:$/i.test(url.protocol)) return false;
    return /\.(png|jpe?g|webp|gif|avif|bmp|svg)(\?|#|$)/i.test(url.pathname) || url.searchParams.has("image");
  } catch {
    return false;
  }
}

function collectImageUrls(input: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 4 || input == null) return out;
  if (typeof input === "string") {
    if (isLikelyImageUrl(input)) out.add(input.trim());
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectImageUrls(item, out, depth + 1);
    return out;
  }
  if (typeof input === "object") {
    for (const value of Object.values(input as Record<string, unknown>)) {
      collectImageUrls(value, out, depth + 1);
    }
  }
  return out;
}

async function downloadImageDirect(url: string, filename: string) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("download_failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

export function MarketplaceProductShellDialog({
  open,
  onOpenChange,
  mode,
  row,
  marketplaceLabel,
  marketplaceSlug,
  logoSrc,
  productsListApiUrl,
}: MarketplaceProductShellDialogProps) {
  const { t, locale } = useTranslation();
  const intlTag = intlLocaleTag(locale);
  const isEdit = mode === "edit" && row != null;
  const [createSku, setCreateSku] = useState("");
  const [createSecondaryId, setCreateSecondaryId] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [rawOpen, setRawOpen] = useState(false);

  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiRecord, setApiRecord] = useState<Record<string, unknown> | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);

  const layout = useMemo(() => resolveShellLayout(marketplaceSlug), [marketplaceSlug]);

  useEffect(() => {
    if (open && mode === "create") {
      setCreateSku("");
      setCreateSecondaryId("");
      setCreateTitle("");
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open) setRawOpen(false);
  }, [open]);

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

  const displayRow = useMemo(() => {
    if (!isEdit || !row) return null;
    return displayRowFromApi(row, apiRecord);
  }, [isEdit, row, apiRecord]);

  const listPrice = useMemo(() => {
    const r = displayRow ?? row;
    if (!r) return null;
    const rec = r as Record<string, unknown>;
    const p =
      r.priceEur ??
      (typeof rec.price === "number" && Number.isFinite(rec.price) ? rec.price : null) ??
      (typeof rec.price === "string" ? Number(rec.price) : null);
    if (p == null || !Number.isFinite(p)) return null;
    return p;
  }, [displayRow, row]);

  const listStock = displayRow?.stockQty ?? row?.stockQty;

  const technicalKeys = useMemo(() => {
    if (!displayRow) return [];
    return extrasKeysForTechnicalTable(displayRow, layout);
  }, [displayRow, layout]);

  const apiImageUrls = useMemo(() => {
    if (!apiRecord) return [];
    return Array.from(collectImageUrls(apiRecord)).slice(0, 12);
  }, [apiRecord]);

  const readOnlyInputClass = cn(MARKETPLACE_PRODUCT_EDITOR_CONTROL, "cursor-default bg-muted/40");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <MarketplaceProductEditorDialogContent>
          <DialogHeader className={MARKETPLACE_PRODUCT_EDITOR_HEADER_CLASS}>
            <DialogTitle className={MARKETPLACE_PRODUCT_EDITOR_TITLE_CLASS}>
              <span className={MARKETPLACE_PRODUCT_EDITOR_LOGO_WRAP_CLASS} aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoSrc} alt="" className={MARKETPLACE_PRODUCT_EDITOR_LOGO_IMG_CLASS} loading="lazy" />
              </span>
              {isEdit
                ? t("marketplaceProducts.productShell.editTitle", { marketplace: marketplaceLabel })
                : t("marketplaceProducts.productShell.createTitle", { marketplace: marketplaceLabel })}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("marketplaceProducts.productShell.description", { marketplace: marketplaceLabel })}
            </DialogDescription>
          </DialogHeader>

          <div className={MARKETPLACE_PRODUCT_EDITOR_SCROLL_OUTER_CLASS}>
            <div className={MARKETPLACE_PRODUCT_EDITOR_BODY_PADDING_CLASS}>
              <section className={MARKETPLACE_PRODUCT_EDITOR_SECTION}>
                <h3 className={MARKETPLACE_PRODUCT_EDITOR_H3}>
                  {t("marketplaceProducts.productShell.stammdatenSection")}
                </h3>
                <p className={MARKETPLACE_PRODUCT_EDITOR_HINT}>
                  SKU, {t("marketplaceProducts.secondaryId")}, {t("marketplaceProducts.articleName")}.
                </p>
                <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  <label className={MARKETPLACE_PRODUCT_EDITOR_LABEL}>
                    <span className="text-muted-foreground">{t("marketplaceProducts.sku")}</span>
                    <Input
                      readOnly={isEdit}
                      value={isEdit ? (row?.sku ?? "") : createSku}
                      onChange={(e) => setCreateSku(e.target.value)}
                      placeholder={isEdit ? "—" : t("marketplaceProducts.productShell.createSkuPlaceholder")}
                      className={isEdit ? readOnlyInputClass : MARKETPLACE_PRODUCT_EDITOR_CONTROL}
                    />
                  </label>
                  <label className={MARKETPLACE_PRODUCT_EDITOR_LABEL}>
                    <span className="text-muted-foreground">{t("marketplaceProducts.secondaryId")}</span>
                    <Input
                      readOnly={isEdit}
                      value={isEdit ? (row?.secondaryId ?? "") : createSecondaryId}
                      onChange={(e) => setCreateSecondaryId(e.target.value)}
                      placeholder={isEdit ? "—" : t("marketplaceProducts.productShell.createIdPlaceholder")}
                      className={isEdit ? readOnlyInputClass : MARKETPLACE_PRODUCT_EDITOR_CONTROL}
                    />
                  </label>
                </div>
                <label className={cn(MARKETPLACE_PRODUCT_EDITOR_LABEL, "mt-1")}>
                  <span className="text-muted-foreground">{t("marketplaceProducts.articleName")}</span>
                  <Input
                    readOnly={isEdit}
                    value={isEdit ? (row?.title ?? "") : createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder={isEdit ? "—" : t("marketplaceProducts.productShell.createTitlePlaceholder")}
                    className={isEdit ? readOnlyInputClass : MARKETPLACE_PRODUCT_EDITOR_CONTROL}
                  />
                </label>
                {isEdit && row ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className={cn(MARKETPLACE_PRODUCT_EDITOR_HINT, "mt-0")}>
                      {t("marketplaceProducts.status")}
                    </span>
                    <Badge variant={row.isActive ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">
                      {row.isActive ? t("marketplaceProducts.active") : t("marketplaceProducts.inactive")}
                    </Badge>
                  </div>
                ) : null}
              </section>

              {isEdit && displayRow ? (
                <section className={MARKETPLACE_PRODUCT_EDITOR_SECTION}>
                  <h3 className={MARKETPLACE_PRODUCT_EDITOR_H3}>
                    {t("marketplaceProducts.productShell.listFieldsSection")}
                  </h3>
                  <p className={MARKETPLACE_PRODUCT_EDITOR_HINT}>
                    {t("marketplaceProducts.productShell.listFieldStatusLabel")} · EUR · Bestand
                  </p>
                  <dl className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-3">
                    <div>
                      <dt className={cn(MARKETPLACE_PRODUCT_EDITOR_HINT, "mt-0")}>
                        {t("marketplaceProducts.productShell.listFieldStatusLabel")}
                      </dt>
                      <dd className={cn(MARKETPLACE_PRODUCT_EDITOR_FIELD, "font-medium text-foreground")}>
                        {displayRow.statusLabel || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className={cn(MARKETPLACE_PRODUCT_EDITOR_HINT, "mt-0")}>
                        {t("marketplaceProducts.productShell.listFieldPriceEur")}
                      </dt>
                      <dd className={cn(MARKETPLACE_PRODUCT_EDITOR_FIELD, "font-medium tabular-nums text-foreground")}>
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
                      <dt className={cn(MARKETPLACE_PRODUCT_EDITOR_HINT, "mt-0")}>
                        {t("marketplaceProducts.productShell.listFieldStockQty")}
                      </dt>
                      <dd className={cn(MARKETPLACE_PRODUCT_EDITOR_FIELD, "font-medium tabular-nums text-foreground")}>
                        {listStock != null && Number.isFinite(listStock)
                          ? new Intl.NumberFormat(intlTag, { maximumFractionDigits: 0 }).format(listStock)
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </section>
              ) : null}

              {isEdit && productsListApiUrl ? (
                <>
                  {apiLoading ? (
                    <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-1.5 text-[10px] text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                      {t("marketplaceProducts.productShell.apiDetailLoading")}
                    </div>
                  ) : null}
                  {apiError ? (
                    <div className="rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-[10px] text-red-700">
                      {apiError}
                    </div>
                  ) : null}
                  {!apiLoading && !apiError && apiRecord == null && isEdit ? (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-1.5 text-[10px] text-amber-800">
                      {t("marketplaceProducts.productShell.apiDetailEmpty")}
                    </div>
                  ) : null}
                </>
              ) : null}

              {isEdit && displayRow && layout.marketplaceSections.length > 0
                ? layout.marketplaceSections.map((sec) => (
                    <section key={sec.titleKey} className={MARKETPLACE_PRODUCT_EDITOR_SECTION}>
                      <h3 className={MARKETPLACE_PRODUCT_EDITOR_H3}>
                        {t(`marketplaceProducts.productShell.shellLayout.sections.${sec.titleKey}`)}
                      </h3>
                      {sec.hintKey ? (
                        <p className={MARKETPLACE_PRODUCT_EDITOR_HINT}>
                          {t(`marketplaceProducts.productShell.shellLayout.sections.${sec.hintKey}`)}
                        </p>
                      ) : null}
                      <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                        {sec.fields.map((f) => {
                          const raw = displayRow.extras?.[f.extrasKey];
                          return (
                            <label key={`${sec.titleKey}-${f.extrasKey}`} className={MARKETPLACE_PRODUCT_EDITOR_LABEL}>
                              <span className="text-muted-foreground">
                                {t(`marketplaceProducts.productShell.shellLayout.fields.${f.labelKey}`)}
                              </span>
                              <div
                                className={cn(
                                  readOnlyInputClass,
                                  "flex min-h-6 items-center whitespace-pre-wrap break-words py-0.5"
                                )}
                              >
                                {formatShellFieldValue(raw, f.format, intlTag)}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  ))
                : null}

              {isEdit && marketplaceSlug === "tiktok" && layout.marketplaceSections.length === 0 ? (
                <section className={MARKETPLACE_PRODUCT_EDITOR_SECTION}>
                  <p className={MARKETPLACE_PRODUCT_EDITOR_HINT}>
                    {t("marketplaceProducts.productShell.shellLayout.tiktokPlaceholder")}
                  </p>
                </section>
              ) : null}

              {isEdit && displayRow && technicalKeys.length > 0 ? (
                <section className={MARKETPLACE_PRODUCT_EDITOR_SECTION}>
                  <h3 className={MARKETPLACE_PRODUCT_EDITOR_H3}>
                    {t("marketplaceProducts.productShell.shellLayout.technicalSection")}
                  </h3>
                  <p className={MARKETPLACE_PRODUCT_EDITOR_HINT}>
                    {t("marketplaceProducts.productShell.shellLayout.technicalHint")}
                  </p>
                  <div className="mt-1 max-h-40 overflow-auto rounded-md border border-border/60">
                    <table className="w-full text-left text-[10px]">
                      <tbody>
                        {technicalKeys.map((key) => (
                          <tr key={key} className="border-b border-border/40 last:border-0">
                            <th className="w-[38%] whitespace-normal break-words px-1.5 py-0.5 align-top font-medium text-muted-foreground">
                              {key}
                            </th>
                            <td className="whitespace-pre-wrap break-all px-1.5 py-0.5 align-top font-mono text-[9px] text-foreground">
                              {formatJsonCell(displayRow.extras?.[key])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {isEdit && apiRecord && (
                <div className="rounded-md border border-border/60 bg-muted/10 p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-full justify-between px-2 text-[10px]"
                    onClick={() => setRawOpen((v) => !v)}
                  >
                    <span>{t("marketplaceProducts.productShell.apiDetailSection")}</span>
                    <span className="text-muted-foreground">{rawOpen ? "▲" : "▼"}</span>
                  </Button>
                  {rawOpen ? (
                    <div className="max-h-48 overflow-auto border-t border-border/40 px-1 py-1">
                      <table className="w-full text-left text-[9px]">
                        <tbody>
                          {Object.entries(apiRecord)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([key, value]) => (
                              <tr key={key} className="border-b border-border/30 last:border-0">
                                <th className="w-[34%] align-top font-medium text-muted-foreground">{key}</th>
                                <td className="break-all font-mono text-[8px]">{formatJsonCell(value)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              )}

              {isEdit && apiImageUrls.length > 0 ? (
                <section className={MARKETPLACE_PRODUCT_EDITOR_SECTION}>
                  <h3 className={MARKETPLACE_PRODUCT_EDITOR_H3}>
                    {t("marketplaceProducts.productShell.shellLayout.imageSection")}
                  </h3>
                  <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {apiImageUrls.map((url, idx) => (
                      <div
                        key={`${url}-${idx}`}
                        className="space-y-0.5 rounded-md border border-border/60 bg-background/70 p-1"
                      >
                        <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded border border-border/50 bg-muted/30">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                        </div>
                        <div className="flex justify-end gap-px">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-0 px-1.5 text-[9px]"
                            onClick={() => {
                              setPreviewImageUrl(url);
                              setPreviewImageIndex(idx + 1);
                            }}
                            title={t("marketplaceProducts.productShell.shellLayout.openImagePreview")}
                          >
                            <Maximize2 className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="sr-only">
                              {t("marketplaceProducts.productShell.shellLayout.openImagePreview")}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-0 px-1.5 text-[9px]"
                            onClick={() => void downloadImageDirect(url, `produktbild-${idx + 1}.jpg`)}
                            title={t("marketplaceProducts.productShell.shellLayout.downloadImage")}
                          >
                            <Download className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="sr-only">
                              {t("marketplaceProducts.productShell.shellLayout.downloadImage")}
                            </span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>

          <DialogFooter className={MARKETPLACE_PRODUCT_EDITOR_FOOTER_CLASS}>
            <span className="text-[9px] leading-snug text-muted-foreground">
              {t("marketplaceProducts.productShell.footerHint")}
            </span>
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => onOpenChange(false)}
              >
                {t("commonUi.close")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-6 px-2 text-[10px]"
                disabled
                title={t("marketplaceProducts.productShell.saveDisabledTitle")}
              >
                {t("marketplaceProducts.productShell.saveToMarketplace")}
              </Button>
            </div>
          </DialogFooter>
        </MarketplaceProductEditorDialogContent>
      </Dialog>

      <Dialog open={previewImageUrl != null} onOpenChange={(next) => !next && setPreviewImageUrl(null)}>
        <DialogContent className="w-[min(72rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] p-3 sm:max-w-[min(72rem,calc(100vw-1rem))] sm:p-4">
          <DialogHeader>
            <DialogTitle>Produktbild {previewImageIndex}</DialogTitle>
            <DialogDescription>Vergrößerte Vorschau</DialogDescription>
          </DialogHeader>
          <div className="flex h-[70vh] w-full items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/20 p-2">
            {previewImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewImageUrl} alt="" className="max-h-full max-w-full object-contain" loading="eager" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
