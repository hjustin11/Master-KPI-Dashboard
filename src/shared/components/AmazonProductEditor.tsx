"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RotateCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { MarketplaceProductEditorDialogContent } from "@/shared/components/MarketplaceProductEditorDialogContent";
import {
  MARKETPLACE_PRODUCT_EDITOR_BODY_PADDING_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_CONTROL as AMAZON_EDITOR_CONTROL,
  MARKETPLACE_PRODUCT_EDITOR_FIELD as AMAZON_EDITOR_FIELD,
  MARKETPLACE_PRODUCT_EDITOR_FOOTER_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_HEADER_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_HINT as AMAZON_EDITOR_HINT,
  MARKETPLACE_PRODUCT_EDITOR_H3 as AMAZON_EDITOR_H3,
  MARKETPLACE_PRODUCT_EDITOR_LABEL as AMAZON_EDITOR_LABEL,
  MARKETPLACE_PRODUCT_EDITOR_LOGO_IMG_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_LOGO_WRAP_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_SCROLL_OUTER_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_SECTION as AMAZON_EDITOR_SECTION,
  MARKETPLACE_PRODUCT_EDITOR_TITLE_CLASS,
} from "@/shared/lib/marketplaceProductEditorTokens";
import { cn } from "@/lib/utils";
import {
  AMAZON_DRAFT_IMAGE_SLOT_COUNT,
  padAmazonDraftImages,
  sanitizeAmazonBulletPoints,
} from "@/shared/lib/amazonProductDraft";
import {
  getAmazonProductTypeSchema,
  getMissingAmazonRequiredFields,
} from "@/shared/lib/amazonProductTypeSchema";
import {
  AMAZON_EDITOR_CONDITION_VALUES,
  isLikelyAmazonShippingUuid,
  normalizeConditionTypeForDraft,
} from "@/shared/lib/amazonMeasureDisplay";
import { useTranslation } from "@/i18n/I18nProvider";
import { AmazonDraftSuggestionTrigger } from "@/shared/components/AmazonDraftSuggestionTrigger";
import type { ContentAuditSuggestions } from "@/shared/hooks/useAmazonContentAudit";
import type { AmazonProductDraftValues } from "@/shared/lib/amazonProductDraft";
import { Maximize2, Download, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const AMAZON_DRAFT_IMAGE_MAX_MB = 8;

function AmazonDraftImageSlot({
  index,
  url,
  onClear,
}: {
  index: number;
  url: string;
  onClear: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const [prevUrl, setPrevUrl] = useState(url);
  const [previewOpen, setPreviewOpen] = useState(false);
  const trimmed = url.trim();

  if (url !== prevUrl) {
    setPrevUrl(url);
    setBroken(false);
  }

  const showImg = Boolean(trimmed && !broken);

  return (
    <div className="h-fit w-full min-w-0 rounded border border-border/60 bg-card p-px shadow-sm">
      <div className="relative aspect-square w-full overflow-hidden rounded border border-border/45 bg-muted/30">
        <span className="pointer-events-none absolute top-0.5 left-0.5 z-[1] rounded bg-background/90 px-0.5 py-px text-[8px] font-semibold tabular-nums text-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-sm">
          {index + 1}
        </span>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={trimmed}
            alt=""
            className="h-full w-full object-contain"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-1">
            <span className="text-center text-[8px] leading-tight text-muted-foreground">
              {broken ? "Vorschau fehlerhaft" : "—"}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 z-[1] flex flex-row items-center justify-center gap-px border-t border-border/50 bg-background/90 px-0.5 py-px backdrop-blur-sm">
          {trimmed ? (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/40 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Bild ${index + 1} vergrößern`}
              title="Vergrößern"
            >
              <Maximize2 className="h-2.5 w-2.5" aria-hidden />
            </button>
          ) : null}
          {trimmed ? (
            <button
              type="button"
              onClick={() => {
                /* Download handler would be passed as prop */
              }}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/40 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Bild ${index + 1} herunterladen`}
              title="Herunterladen"
            >
              <Download className="h-2.5 w-2.5" aria-hidden />
            </button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 border border-border/60 bg-muted/40 p-0 text-foreground hover:bg-destructive/15 hover:text-destructive"
            onClick={onClear}
            aria-label={`Bild ${index + 1} entfernen`}
            title="Entfernen"
          >
            <Trash2 className="h-2.5 w-2.5" aria-hidden />
          </Button>
        </div>
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[min(72rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] p-3 sm:max-w-[min(72rem,calc(100vw-1rem))] sm:p-4">
          <DialogHeader>
            <DialogTitle>Produktbild {index + 1}</DialogTitle>
            <DialogDescription>Vergrößerte Vorschau</DialogDescription>
          </DialogHeader>
          <div className="flex h-[70vh] w-full items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/20 p-2">
            {showImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={trimmed} alt="" className="max-h-full max-w-full object-contain" loading="eager" />
            ) : (
              <p className="text-sm text-muted-foreground">Keine Bildvorschau verfügbar.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AmazonDraftImageAddTile({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex aspect-square w-full min-h-0 flex-col items-center justify-center gap-px rounded border border-dashed border-border/70 bg-muted/20 p-px text-center text-[8px] text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-foreground"
      aria-label="Weitere Bilder hinzufügen"
      title="Weitere Bilder hinzufügen"
    >
      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="leading-tight">Hinzufügen</span>
    </button>
  );
}

export type AmazonProductEditorProps = {
  /** Draft data from useAmazonDraftEditor */
  draftValues: AmazonProductDraftValues;
  draftLoading: boolean;
  draftSaving: boolean;
  draftError: string | null;
  draftTableMissing: boolean;
  draftStatus: "draft" | "ready";
  detailLoadHint: string | null;
  editorMode: "create_new" | "edit_existing";

  /** Audit data from useAmazonContentAudit */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auditPayload: Record<string, any> | null;
  auditLoading: boolean;
  auditError: string | null;
  contentAuditSuggestions: ContentAuditSuggestions;
  displayedContentAuditFindings: Array<{
    id: string;
    severity: string;
    message: string;
    recommendation?: string;
  }>;

  /** Callbacks */
  onClose: () => void;
  onSave: () => Promise<void>;
  onSetDraftValues: (updater: (prev: AmazonProductDraftValues) => AmazonProductDraftValues) => void;
  onFetchContentAudit: (sku: string, opts?: { refresh?: boolean }) => Promise<void>;

  /** UI state */
  logoSrc: string;
  marketplaceSlug: string;
  canEditProducts: boolean;
  imageDropActive: boolean;
  onSetImageDropActive: (active: boolean) => void;
  imageFileInputRef: React.RefObject<HTMLInputElement | null>;
  amazonImageSlots: string[];
  filledAmazonImageIndices: number[];
  canAddMoreAmazonImages: boolean;
  productTypeOptions: Array<{ value: string; label: string }>;
  onImageDrop: (dataTransfer: DataTransfer) => Promise<void>;
  onImageFileInputChange: (files: FileList | null) => Promise<void>;
};

export function AmazonProductEditor({
  draftValues,
  draftLoading,
  draftSaving,
  draftError,
  draftTableMissing,
  draftStatus,
  detailLoadHint,
  editorMode,
  auditPayload,
  auditLoading,
  auditError,
  contentAuditSuggestions,
  displayedContentAuditFindings,
  onClose,
  onSave,
  onSetDraftValues,
  onFetchContentAudit,
  logoSrc,
  marketplaceSlug,
  canEditProducts,
  imageDropActive,
  onSetImageDropActive,
  imageFileInputRef,
  amazonImageSlots,
  filledAmazonImageIndices,
  canAddMoreAmazonImages,
  productTypeOptions,
  onImageDrop,
  onImageFileInputChange,
}: AmazonProductEditorProps) {
  const { t } = useTranslation();

  // LLM-Begründungen pro Feld (für reason-Prop in Suggestion-Triggern)
  const llmFields = auditPayload?.titleOptimization?.fields;

  const selectedProductTypeSchema = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getAmazonProductTypeSchema((draftValues as any).productType as string);
  }, [draftValues]);

  const missingRequiredFields = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getMissingAmazonRequiredFields(draftValues as any);
  }, [draftValues]);

  return (
    <MarketplaceProductEditorDialogContent>
      <DialogHeader className={MARKETPLACE_PRODUCT_EDITOR_HEADER_CLASS}>
        <DialogTitle className={MARKETPLACE_PRODUCT_EDITOR_TITLE_CLASS}>
          <span className={MARKETPLACE_PRODUCT_EDITOR_LOGO_WRAP_CLASS} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="" className={MARKETPLACE_PRODUCT_EDITOR_LOGO_IMG_CLASS} loading="lazy" />
          </span>
          <span className="inline-flex items-center gap-2">
            {editorMode === "create_new" ? "Neuen Artikel vorbereiten" : "Artikel bearbeiten"}
            {marketplaceSlug === "amazon" && editorMode === "edit_existing" && auditLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : null}
          </span>
        </DialogTitle>
      </DialogHeader>
      <div className={MARKETPLACE_PRODUCT_EDITOR_SCROLL_OUTER_CLASS}>
        {draftLoading ? (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card"
            aria-busy="true"
            aria-live="polite"
          >
            <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" aria-hidden />
            <p className="text-[10px] text-muted-foreground">Produktdaten werden geladen…</p>
          </div>
        ) : null}
        <div
          className={cn(
            MARKETPLACE_PRODUCT_EDITOR_BODY_PADDING_CLASS,
            draftLoading && "pointer-events-none select-none opacity-[0.35]"
          )}
        >
          {detailLoadHint ? (
            <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-950 dark:text-amber-100">
              {detailLoadHint}
            </div>
          ) : null}
          {draftTableMissing ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-1.5 text-[10px] leading-snug text-amber-700">
              Tabelle für Produkt-Entwürfe fehlt. Bitte Supabase-Migration ausführen.
            </div>
          ) : null}
          {draftError ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-[10px] leading-snug text-red-700">
              {draftError}
            </div>
          ) : null}
          {marketplaceSlug === "amazon" && canEditProducts && editorMode === "edit_existing" ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-[10px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">Content-Prüfung</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[10px]"
                  disabled={auditLoading || !draftValues.sku.trim()}
                  onClick={() => void onFetchContentAudit(draftValues.sku)}
                >
                  {auditLoading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : null}
                  Erneut prüfen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[10px]"
                  disabled={auditLoading || !draftValues.sku.trim()}
                  onClick={() => void onFetchContentAudit(draftValues.sku, { refresh: true })}
                  title="Lädt u. a. Shopify/Marktplatz-Listen neu und prüft erneut"
                >
                  <RotateCw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Mit Marktdaten-Refresh
                </Button>
              </div>
              {auditPayload && !auditLoading && !auditError ? (
                <p className="text-muted-foreground">
                  {displayedContentAuditFindings.length} Hinweis(e) · {auditPayload.diffs.length}{" "}
                  Kanal-Abweichung(en)
                  {displayedContentAuditFindings.length === 0 ? " — keine strukturellen Mängel erkannt." : ""}
                </p>
              ) : !auditLoading && !auditError && !auditPayload ? (
                <p className="text-muted-foreground">
                  Nach dem Laden der Produktdaten startet die Prüfung automatisch; hier kannst du sie manuell
                  wiederholen.
                </p>
              ) : null}
            </div>
          ) : null}
          {marketplaceSlug === "amazon" && canEditProducts && auditError ? (
            <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-950 dark:text-amber-100">
              Content-Prüfung: {auditError}
            </div>
          ) : null}
          {marketplaceSlug === "amazon" && canEditProducts && auditPayload && !auditLoading ? (
            <details className="rounded-md border border-border/60 bg-muted/25 px-2 py-1 text-[10px]">
              <summary className="cursor-pointer font-medium text-foreground">
                Alle Prüfhinweise ({displayedContentAuditFindings.length}) — Titel bezogen auf aktuellen Editor-Text
              </summary>
              {displayedContentAuditFindings.length === 0 ? (
                <p className="mt-1 text-muted-foreground">Keine strukturellen Hinweise.</p>
              ) : (
                <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                  {displayedContentAuditFindings.map((f) => (
                    <li key={f.id}>
                      <span className="font-medium uppercase text-foreground/80">{f.severity}</span>: {f.message}
                      {f.recommendation ? <span className="mt-0.5 block text-[9px]">{f.recommendation}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ) : null}
          {editorMode === "create_new" && missingRequiredFields.length > 0 ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-1.5 text-[10px] leading-snug text-amber-800">
              <p className="font-medium">Pflichtfelder fehlen:</p>
              <p className="mt-0.5">{missingRequiredFields.map((x) => x.label).join(" • ")}</p>
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1">
            {selectedProductTypeSchema ? (
              <section className={AMAZON_EDITOR_SECTION}>
                <h3 className={AMAZON_EDITOR_H3}>
                  Kategorieattribute ({selectedProductTypeSchema.label})
                </h3>
                <p className={AMAZON_EDITOR_HINT}>Zusätzliche Felder für den gewählten Produkttyp.</p>
                <div className="mt-1 grid grid-cols-1 items-start gap-x-1 gap-y-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                  {selectedProductTypeSchema.attributes.map((field) => (
                    <label key={field.key} className={AMAZON_EDITOR_LABEL}>
                      <span className="text-muted-foreground">
                        {field.label}
                        {field.required ? " *" : ""}
                      </span>
                      <Input
                        className={AMAZON_EDITOR_CONTROL}
                        value={draftValues.attributes[field.key] ?? ""}
                        onChange={(e) =>
                          onSetDraftValues((prev) => ({
                            ...prev,
                            attributes: {
                              ...prev.attributes,
                              [field.key]: e.target.value,
                            },
                          }))
                        }
                        placeholder={field.placeholder}
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-col gap-1 lg:flex-row lg:items-stretch">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 lg:min-w-0 lg:w-0">
                <section className={AMAZON_EDITOR_SECTION}>
                  <h3 className={AMAZON_EDITOR_H3}>Stammdaten</h3>
                  <p className={AMAZON_EDITOR_HINT}>SKU, ASIN und vollständiger Produkttitel.</p>
                  <div className="mt-1 flex flex-col gap-1">
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      <label className={AMAZON_EDITOR_LABEL}>
                        <span className="text-muted-foreground">SKU</span>
                        <Input
                          className={AMAZON_EDITOR_CONTROL}
                          value={draftValues.sku}
                          onChange={(e) => onSetDraftValues((prev) => ({ ...prev, sku: e.target.value }))}
                          placeholder="z. B. ASTRO-123"
                        />
                      </label>
                      <label className={AMAZON_EDITOR_LABEL}>
                        <span className="text-muted-foreground">ASIN</span>
                        <Input
                          className={AMAZON_EDITOR_CONTROL}
                          value={draftValues.asin}
                          onChange={(e) => onSetDraftValues((prev) => ({ ...prev, asin: e.target.value }))}
                          placeholder="z. B. B0..."
                        />
                      </label>
                    </div>
                    <label className={AMAZON_EDITOR_LABEL}>
                      <span className="flex flex-wrap items-center gap-1">
                        <span className="text-muted-foreground">Produkttitel</span>
                        {auditPayload &&
                        marketplaceSlug === "amazon" &&
                        canEditProducts &&
                        editorMode === "edit_existing" &&
                        contentAuditSuggestions.titleBadge ? (
                          <span
                            className={cn(
                              "inline-flex max-w-full items-center gap-0.5 rounded border px-1 py-px text-[9px] leading-tight",
                              contentAuditSuggestions.titleBadge.kind === "ok"
                                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                                : contentAuditSuggestions.titleBadge.kind === "errorLlm"
                                  ? "border-red-500/40 bg-red-500/10 text-red-950 dark:text-red-100"
                                  : "border-amber-500/45 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                            )}
                            title={contentAuditSuggestions.titleBadge.titleAttr}
                          >
                            {contentAuditSuggestions.titleBadge.kind === "ok" ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
                                <span>{contentAuditSuggestions.titleBadge.label}</span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                                <span>{contentAuditSuggestions.titleBadge.label}</span>
                              </>
                            )}
                          </span>
                        ) : null}
                        {contentAuditSuggestions.title.show && auditPayload ? (
                          <AmazonDraftSuggestionTrigger
                            sourceLabel={contentAuditSuggestions.title.sourceLabel}
                            currentText={draftValues.title}
                            proposedText={contentAuditSuggestions.title.proposedText}
                            reason={llmFields?.title?.reason}
                            onApply={() =>
                              onSetDraftValues((prev) => ({
                                ...prev,
                                title: contentAuditSuggestions.title.proposedText,
                              }))
                            }
                          />
                        ) : null}
                      </span>
                      <Textarea
                        value={draftValues.title}
                        onChange={(e) => onSetDraftValues((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="Vollständiger Listungstitel"
                        rows={2}
                        className={cn("min-h-[2.5rem] resize-y py-0.5", AMAZON_EDITOR_FIELD)}
                      />
                    </label>
                  </div>
                </section>
                <div className="flex min-w-0 flex-col gap-1 lg:flex-row lg:items-stretch">
                  <div className="min-w-0 w-full shrink-0 lg:w-0 lg:flex-[1.45] lg:self-start">
                    <section className={cn(AMAZON_EDITOR_SECTION, "flex min-h-0 min-w-0 flex-col")}>
                      <h3 className={cn(AMAZON_EDITOR_H3, "shrink-0")}>Katalog &amp; Angebot</h3>
                      <p className={cn(AMAZON_EDITOR_HINT, "shrink-0")}>Typ, Marke, Preise, Bestand, Versand.</p>
                      <div className="mt-1 min-h-0 grid grid-cols-1 items-start gap-x-1 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                        <label className={cn(AMAZON_EDITOR_LABEL, "xl:col-span-2")}>
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">Produkttyp (Amazon)</span>
                            {contentAuditSuggestions.productType.show && auditPayload ? (
                              <AmazonDraftSuggestionTrigger
                                sourceLabel={contentAuditSuggestions.productType.sourceLabel}
                                currentText={draftValues.productType}
                                proposedText={contentAuditSuggestions.productType.proposedText}
                                reason={llmFields?.productType?.reason}
                                onApply={() =>
                                  onSetDraftValues((prev) => ({
                                    ...prev,
                                    productType: contentAuditSuggestions.productType.proposedText.trim(),
                                  }))
                                }
                              />
                            ) : null}
                          </span>
                          <Select
                            value={draftValues.productType || "__none__"}
                            onValueChange={(value) =>
                              onSetDraftValues((prev) => ({
                                ...prev,
                                productType: !value || value === "__none__" ? "" : value,
                              }))
                            }
                          >
                            <SelectTrigger className={cn("w-full", AMAZON_EDITOR_CONTROL)}>
                              <SelectValue placeholder="Produkttyp wählen" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Nicht gewählt</SelectItem>
                              {productTypeOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.value} - {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">Marke / Hersteller</span>
                            {contentAuditSuggestions.brand.show && auditPayload ? (
                              <AmazonDraftSuggestionTrigger
                                sourceLabel={contentAuditSuggestions.brand.sourceLabel}
                                currentText={draftValues.brand}
                                proposedText={contentAuditSuggestions.brand.proposedText}
                                reason={llmFields?.brand?.reason}
                                onApply={() =>
                                  onSetDraftValues((prev) => ({
                                    ...prev,
                                    brand: contentAuditSuggestions.brand.proposedText.trim(),
                                  }))
                                }
                              />
                            ) : null}
                          </span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
                            value={draftValues.brand}
                            onChange={(e) => onSetDraftValues((prev) => ({ ...prev, brand: e.target.value }))}
                            placeholder="z. B. AstroPet"
                          />
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="text-muted-foreground">UVP (EUR)</span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
                            value={draftValues.uvpEur}
                            onChange={(e) => onSetDraftValues((prev) => ({ ...prev, uvpEur: e.target.value }))}
                            placeholder="z. B. 39.99"
                            inputMode="decimal"
                          />
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="text-muted-foreground">Preis (EUR)</span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
                            value={draftValues.listPriceEur}
                            onChange={(e) =>
                              onSetDraftValues((prev) => ({ ...prev, listPriceEur: e.target.value }))
                            }
                            placeholder="z. B. 29.99"
                            inputMode="decimal"
                          />
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="text-muted-foreground">Bestand</span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
                            value={draftValues.quantity}
                            onChange={(e) => onSetDraftValues((prev) => ({ ...prev, quantity: e.target.value }))}
                            placeholder="z. B. 120"
                            inputMode="numeric"
                          />
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="text-muted-foreground">Bearbeitungszeit</span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
                            value={draftValues.handlingTime}
                            onChange={(e) => onSetDraftValues((prev) => ({ ...prev, handlingTime: e.target.value }))}
                            placeholder="z. B. 1-2 Werktage"
                          />
                        </label>
                        <label className={cn(AMAZON_EDITOR_LABEL, "xl:col-span-2")}>
                          <span className="text-muted-foreground">Versandvorlage</span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
                            value={draftValues.shippingTemplate}
                            onChange={(e) =>
                              onSetDraftValues((prev) => ({
                                ...prev,
                                shippingTemplate: e.target.value,
                              }))
                            }
                            placeholder="z. B. Standard DE"
                          />
                          {isLikelyAmazonShippingUuid(draftValues.shippingTemplate) ? (
                            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                              {t("amazonDraft.shippingUuidHint")}
                            </p>
                          ) : null}
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="text-muted-foreground">Zustand</span>
                          <Select
                            value={normalizeConditionTypeForDraft(draftValues.conditionType)}
                            onValueChange={(value) =>
                              onSetDraftValues((prev) => ({
                                ...prev,
                                conditionType: value ?? "new_new",
                              }))
                            }
                          >
                            <SelectTrigger className={cn("w-full", AMAZON_EDITOR_CONTROL)}>
                              <SelectValue>
                                {t(
                                  `amazonDraft.condition.${normalizeConditionTypeForDraft(
                                    draftValues.conditionType
                                  )}`
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {AMAZON_EDITOR_CONDITION_VALUES.map((condKey) => (
                                <SelectItem key={condKey} value={condKey}>
                                  {t(`amazonDraft.condition.${condKey}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">Externe Produkt-ID</span>
                            {contentAuditSuggestions.ean && auditPayload?.xentralEan ? (
                              <AmazonDraftSuggestionTrigger
                                sourceLabel="Xentral (EAN)"
                                currentText={
                                  draftValues.externalProductId.trim() ? draftValues.externalProductId : "—"
                                }
                                proposedText={auditPayload.xentralEan}
                                onApply={() =>
                                  onSetDraftValues((prev) => ({
                                    ...prev,
                                    externalProductId: auditPayload.xentralEan ?? "",
                                    externalProductIdType: "ean",
                                  }))
                                }
                              />
                            ) : null}
                          </span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
                            value={draftValues.externalProductId}
                            onChange={(e) =>
                              onSetDraftValues((prev) => ({
                                ...prev,
                                externalProductId: e.target.value,
                              }))
                            }
                            placeholder="EAN/UPC/GTIN/ISBN"
                          />
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="text-muted-foreground">ID-Typ</span>
                          <Select
                            value={draftValues.externalProductIdType}
                            onValueChange={(value) =>
                              onSetDraftValues((prev) => ({
                                ...prev,
                                externalProductIdType: value as "ean" | "upc" | "gtin" | "isbn" | "none",
                              }))
                            }
                          >
                            <SelectTrigger className={cn("w-full", AMAZON_EDITOR_CONTROL)}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ean">EAN</SelectItem>
                              <SelectItem value="upc">UPC</SelectItem>
                              <SelectItem value="gtin">GTIN</SelectItem>
                              <SelectItem value="isbn">ISBN</SelectItem>
                              <SelectItem value="none">Keine (GTIN exemption)</SelectItem>
                            </SelectContent>
                          </Select>
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">{t("amazonDraft.dimensionLength")}</span>
                            {contentAuditSuggestions.packageLength.show && auditPayload ? (
                              <AmazonDraftSuggestionTrigger
                                sourceLabel={contentAuditSuggestions.packageLength.sourceLabel}
                                currentText={draftValues.packageLength}
                                proposedText={contentAuditSuggestions.packageLength.proposedText}
                                reason={llmFields?.packageLength?.reason}
                                onApply={() =>
                                  onSetDraftValues((prev) => ({
                                    ...prev,
                                    packageLength: contentAuditSuggestions.packageLength.proposedText.trim(),
                                  }))
                                }
                              />
                            ) : null}
                          </span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
                            value={draftValues.packageLength}
                            onChange={(e) =>
                              onSetDraftValues((prev) => ({
                                ...prev,
                                packageLength: e.target.value,
                              }))
                            }
                            placeholder="0"
                            inputMode="decimal"
                          />
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">{t("amazonDraft.dimensionWidth")}</span>
                            {contentAuditSuggestions.packageWidth.show && auditPayload ? (
                              <AmazonDraftSuggestionTrigger
                                sourceLabel={contentAuditSuggestions.packageWidth.sourceLabel}
                                currentText={draftValues.packageWidth}
                                proposedText={contentAuditSuggestions.packageWidth.proposedText}
                                reason={llmFields?.packageWidth?.reason}
                                onApply={() =>
                                  onSetDraftValues((prev) => ({
                                    ...prev,
                                    packageWidth: contentAuditSuggestions.packageWidth.proposedText.trim(),
                                  }))
                                }
                              />
                            ) : null}
                          </span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
                            value={draftValues.packageWidth}
                            onChange={(e) =>
                              onSetDraftValues((prev) => ({
                                ...prev,
                                packageWidth: e.target.value,
                              }))
                            }
                            placeholder="0"
                            inputMode="decimal"
                          />
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">{t("amazonDraft.dimensionHeight")}</span>
                            {contentAuditSuggestions.packageHeight.show && auditPayload ? (
                              <AmazonDraftSuggestionTrigger
                                sourceLabel={contentAuditSuggestions.packageHeight.sourceLabel}
                                currentText={draftValues.packageHeight}
                                proposedText={contentAuditSuggestions.packageHeight.proposedText}
                                reason={llmFields?.packageHeight?.reason}
                                onApply={() =>
                                  onSetDraftValues((prev) => ({
                                    ...prev,
                                    packageHeight: contentAuditSuggestions.packageHeight.proposedText.trim(),
                                  }))
                                }
                              />
                            ) : null}
                          </span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
                            value={draftValues.packageHeight}
                            onChange={(e) =>
                              onSetDraftValues((prev) => ({
                                ...prev,
                                packageHeight: e.target.value,
                              }))
                            }
                            placeholder="0"
                            inputMode="decimal"
                          />
                        </label>
                        <label className={AMAZON_EDITOR_LABEL}>
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">{t("amazonDraft.weightKg")}</span>
                            {contentAuditSuggestions.packageWeight.show && auditPayload ? (
                              <AmazonDraftSuggestionTrigger
                                sourceLabel={contentAuditSuggestions.packageWeight.sourceLabel}
                                currentText={draftValues.packageWeight}
                                proposedText={contentAuditSuggestions.packageWeight.proposedText}
                                reason={llmFields?.packageWeight?.reason}
                                onApply={() =>
                                  onSetDraftValues((prev) => ({
                                    ...prev,
                                    packageWeight: contentAuditSuggestions.packageWeight.proposedText.trim(),
                                  }))
                                }
                              />
                            ) : null}
                          </span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
                            value={draftValues.packageWeight}
                            onChange={(e) =>
                              onSetDraftValues((prev) => ({
                                ...prev,
                                packageWeight: e.target.value,
                              }))
                            }
                            placeholder="0"
                            inputMode="decimal"
                          />
                        </label>
                      </div>
                    </section>
                  </div>
                  <div className="flex min-h-0 min-w-0 w-full flex-col lg:w-0 lg:flex-[1.2] lg:self-stretch">
                    <section
                      className={cn(
                        AMAZON_EDITOR_SECTION,
                        "flex min-h-0 min-w-0 flex-col lg:min-h-0 lg:flex-1"
                      )}
                    >
                      <h3 className={cn(AMAZON_EDITOR_H3, "shrink-0")}>
                        {t("amazonDraft.contentSectionTitle")}
                      </h3>
                      <p className={cn(AMAZON_EDITOR_HINT, "shrink-0")}>
                        {t("amazonDraft.contentSectionHint")}
                      </p>
                      <div className="mt-1 flex min-h-0 flex-col gap-1 lg:min-h-0 lg:flex-1">
                        <label
                          className={cn(
                            AMAZON_EDITOR_LABEL,
                            "flex min-h-0 min-w-0 flex-col lg:min-h-0 lg:flex-1"
                          )}
                        >
                          <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                            Beschreibung
                            {contentAuditSuggestions.description.show && auditPayload ? (
                              <AmazonDraftSuggestionTrigger
                                sourceLabel={contentAuditSuggestions.description.sourceLabel}
                                currentText={draftValues.description}
                                proposedText={contentAuditSuggestions.description.proposedText}
                                reason={llmFields?.description?.reason}
                                onApply={() =>
                                  onSetDraftValues((prev) => ({
                                    ...prev,
                                    description: contentAuditSuggestions.description.proposedText,
                                  }))
                                }
                              />
                            ) : null}
                          </span>
                          <Textarea
                            value={draftValues.description}
                            onChange={(e) =>
                              onSetDraftValues((prev) => ({
                                ...prev,
                                description: e.target.value,
                              }))
                            }
                            className={cn(
                              "field-sizing-fixed min-h-[2.75rem] resize-y py-0.5 lg:min-h-0 lg:flex-1",
                              AMAZON_EDITOR_FIELD
                            )}
                            rows={2}
                            placeholder="Beschreibung"
                          />
                        </label>
                      </div>
                    </section>
                  </div>
                </div>
                <section className={AMAZON_EDITOR_SECTION}>
                  <div className="flex flex-wrap items-center gap-1">
                    <h3 className={AMAZON_EDITOR_H3}>{t("amazonDraft.bulletsSectionTitle")}</h3>
                    {contentAuditSuggestions.bullets.show && auditPayload ? (
                      <AmazonDraftSuggestionTrigger
                        className="translate-y-px"
                        sourceLabel={contentAuditSuggestions.bullets.sourceLabel}
                        currentText={(draftValues.bulletPoints as string[]).map((b: string) => b.trim()).join("\n")}
                        proposedText={contentAuditSuggestions.bullets.proposedText}
                        reason={contentAuditSuggestions.bulletsReason || undefined}
                        onApply={() => {
                          const next = contentAuditSuggestions.bullets.proposedText
                            .split("\n")
                            .map((x) => x.trim())
                            .filter(Boolean);
                          const padded = sanitizeAmazonBulletPoints(next).slice(0, 5);
                          while (padded.length < 5) padded.push("");
                          onSetDraftValues((prev) => ({
                            ...prev,
                            bulletPoints: padded,
                          }));
                        }}
                        ariaLabel="Alle Bullets übernehmen"
                      />
                    ) : null}
                  </div>
                  <p className={AMAZON_EDITOR_HINT}>{t("amazonDraft.bulletsSectionHint")}</p>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {[0, 1, 2, 3, 4].map((idx) => (
                      <label key={`bp-${idx}`} className={AMAZON_EDITOR_LABEL}>
                        <span className="flex items-center gap-1">
                          <span className="text-muted-foreground">
                            {t("amazonDraft.bulletPlaceholder", { n: idx + 1 })}
                          </span>
                          {contentAuditSuggestions.bulletChips[idx]?.show && auditPayload ? (
                            <AmazonDraftSuggestionTrigger
                              sourceLabel={contentAuditSuggestions.bulletChips[idx].sourceLabel}
                              currentText={draftValues.bulletPoints[idx] ?? ""}
                              proposedText={contentAuditSuggestions.bulletChips[idx].proposedText}
                              reason={contentAuditSuggestions.bulletsReason || undefined}
                              onApply={() =>
                                onSetDraftValues((prev) => {
                                  const next = [...prev.bulletPoints];
                                  next[idx] = contentAuditSuggestions.bulletChips[idx].proposedText;
                                  return { ...prev, bulletPoints: next };
                                })
                              }
                            />
                          ) : null}
                        </span>
                        <Textarea
                          className={cn(
                            "field-sizing-content max-h-[min(22vh,7rem)] min-h-[1.75rem] resize-y overflow-y-auto py-0.5",
                            AMAZON_EDITOR_FIELD
                          )}
                          rows={1}
                          value={draftValues.bulletPoints[idx] ?? ""}
                          onChange={(e) =>
                            onSetDraftValues((prev) => {
                              const next = [...prev.bulletPoints];
                              next[idx] = e.target.value;
                              return { ...prev, bulletPoints: next };
                            })
                          }
                          placeholder={t("amazonDraft.bulletPlaceholder", { n: idx + 1 })}
                        />
                      </label>
                    ))}
                  </div>
                </section>

                {contentAuditSuggestions.searchTerms.show && auditPayload ? (
                  <section className={AMAZON_EDITOR_SECTION}>
                    <div className="flex flex-wrap items-center gap-1">
                      <h3 className={AMAZON_EDITOR_H3}>Suchbegriffe (Vorschlag)</h3>
                      <AmazonDraftSuggestionTrigger
                        className="translate-y-px"
                        sourceLabel={contentAuditSuggestions.searchTerms.sourceLabel}
                        currentText="(Keine Suchbegriffe hinterlegt)"
                        proposedText={contentAuditSuggestions.searchTerms.proposedText}
                        reason={llmFields?.searchTerms?.reason}
                        onApply={() => {
                          /* Suchbegriffe sind bisher kein Feld im Draft — nur als Vorschlag anzeigen */
                        }}
                        disabled
                      />
                    </div>
                    <p className="mt-1 rounded border border-border/50 bg-muted/20 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                      {contentAuditSuggestions.searchTerms.proposedText}
                    </p>
                  </section>
                ) : null}
              </div>
              <div className="flex min-h-0 w-full shrink-0 flex-col self-stretch lg:w-[min(15rem,100%)] lg:max-w-[15rem]">
                <section className={cn(AMAZON_EDITOR_SECTION, "flex min-h-0 min-w-0 flex-1 flex-col")}>
                  <div className="mb-1 flex shrink-0 flex-wrap items-baseline justify-between gap-1">
                    <h3 className={AMAZON_EDITOR_H3}>Bilder</h3>
                    <span className="text-[9px] tabular-nums leading-none text-muted-foreground">
                      {filledAmazonImageIndices.length}/{AMAZON_DRAFT_IMAGE_SLOT_COUNT}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "mb-1 w-full shrink-0 rounded border border-dashed px-1 py-0.5 text-center text-[9px] leading-tight transition-colors",
                      imageDropActive
                        ? "border-primary/70 bg-primary/5 text-foreground"
                        : "border-border/70 bg-muted/25 text-muted-foreground"
                    )}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSetImageDropActive(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!imageDropActive) onSetImageDropActive(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSetImageDropActive(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSetImageDropActive(false);
                      void onImageDrop(e.dataTransfer);
                    }}
                  >
                    <Upload className="mx-auto mb-px h-2.5 w-2.5 opacity-70" aria-hidden />
                    Ablage · max.&nbsp;{AMAZON_DRAFT_IMAGE_MAX_MB}&nbsp;MB
                  </div>
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void onImageFileInputChange(e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  <div className="mt-1 grid w-full grid-cols-2 items-start gap-1">
                    {filledAmazonImageIndices.map((idx) => (
                      <AmazonDraftImageSlot
                        key={idx}
                        index={idx}
                        url={amazonImageSlots[idx] ?? ""}
                        onClear={() =>
                          onSetDraftValues((prev) => {
                            const next = padAmazonDraftImages(prev.images);
                            next[idx] = "";
                            return { ...prev, images: next };
                          })
                        }
                      />
                    ))}
                    {canAddMoreAmazonImages ? (
                      <AmazonDraftImageAddTile onAdd={() => imageFileInputRef.current?.click()} />
                    ) : null}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
      <DialogFooter className={MARKETPLACE_PRODUCT_EDITOR_FOOTER_CLASS}>
        <span className="text-[9px] leading-snug text-muted-foreground">
          Status: {draftLoading ? "lädt..." : draftStatus === "ready" ? "bereit" : "Entwurf"}
          {editorMode === "create_new" && missingRequiredFields.length > 0
            ? ` • ${missingRequiredFields.length} Pflichtfeld(er) fehlen`
            : ""}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={onClose}>
            Schließen
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => void onSave()}
            disabled={draftSaving || draftLoading}
          >
            {draftSaving ? "Speichert..." : "Entwurf speichern"}
          </Button>
        </div>
      </DialogFooter>
    </MarketplaceProductEditorDialogContent>
  );
}
