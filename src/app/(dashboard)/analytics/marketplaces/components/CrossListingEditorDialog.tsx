"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MarketplaceProductEditorDialogContent } from "@/shared/components/MarketplaceProductEditorDialogContent";
import {
  MARKETPLACE_PRODUCT_EDITOR_BODY_PADDING_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_HEADER_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_HINT,
  MARKETPLACE_PRODUCT_EDITOR_LOGO_IMG_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_LOGO_WRAP_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_SCROLL_OUTER_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_TITLE_CLASS,
} from "@/shared/lib/marketplaceProductEditorTokens";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";
import {
  type CrossListingDraftRow,
  type CrossListingDraftValues,
  type CrossListingFieldDef,
  type CrossListingSourceSlug,
  type CrossListingTargetSlug,
  emptyDraftValues,
} from "@/shared/lib/crossListing/crossListingDraftTypes";
import { getCrossListingFieldConfig } from "@/shared/lib/crossListing/marketplaceFieldConfigs";
import { mergeForTarget } from "@/shared/lib/crossListing/mergeCrossListingSources";
import { augmentRequiredAttributes } from "@/shared/lib/crossListing/targetRequiredAttributes";
import { optimizeForTarget } from "@/shared/lib/crossListing/optimizeForTarget";
import {
  buildImagePool,
  mergeExistingImagesIntoPool,
  selectedImageUrls,
} from "@/shared/lib/crossListing/buildImagePool";
import type { CrossListingImageEntry } from "@/shared/lib/crossListing/crossListingDraftTypes";
import useCrossListingSourceData from "@/shared/hooks/useCrossListingSourceData";
import useCrossListingOptimize from "@/shared/hooks/useCrossListingOptimize";
import useCrossListingSubmit from "@/shared/hooks/useCrossListingSubmit";
import { useTranslation } from "@/i18n/I18nProvider";
import type { EditorCtx } from "./crossListing/types";
import { CrossListingAiBlock } from "./crossListing/CrossListingAiBlock";
import { CrossListingAmazonFields } from "./crossListing/CrossListingAmazonFields";
import { CrossListingEditorBody } from "./crossListing/CrossListingEditorBody";
import { CrossListingFooter } from "./crossListing/CrossListingFooter";
import { detectAmazonProductType, detectBrowseNode } from "@/shared/lib/amazon/productTypeDetection";
import { validateForAmazonSubmit } from "@/shared/lib/crossListing/amazonPreSubmitValidator";
import {
  AMAZON_EU_MARKETPLACES,
  DEFAULT_AMAZON_SLUG,
} from "@/shared/config/amazonMarketplaces";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AMAZON_LOGO = "/brand/marketplaces/amazon.svg";

type Props = {
  open: boolean;
  sku: string | null;
  targetSlug: CrossListingTargetSlug | null;
  existingDraft?: CrossListingDraftRow | null;
  onClose: () => void;
  onSaved: () => void;
};

function resolveMarketplaceMeta(slug: CrossListingTargetSlug): { label: string; logo: string } {
  if (slug === "amazon") return { label: "Amazon", logo: AMAZON_LOGO };
  const m = ANALYTICS_MARKETPLACES.find((x) => x.slug === slug);
  return { label: m?.label ?? slug, logo: m?.logo ?? "" };
}

function getMissing(values: CrossListingDraftValues, fields: readonly CrossListingFieldDef[]): string[] {
  const missing: string[] = [];
  for (const f of fields) {
    if (!f.required) continue;
    const raw = (values as unknown as Record<string, unknown>)[f.key];
    if (f.key === "bullets" || f.key === "images" || f.key === "tags") {
      if (!Array.isArray(raw) || raw.length === 0) missing.push(f.key);
    } else if (f.key === "attributes") {
      if (!raw || typeof raw !== "object" || Object.keys(raw as Record<string, unknown>).length === 0) {
        missing.push(f.key);
      }
    } else {
      if (typeof raw !== "string" || !raw.trim()) missing.push(f.key);
    }
  }
  return missing;
}

export default function CrossListingEditorDialog({
  open,
  sku,
  targetSlug,
  existingDraft,
  onClose,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<CrossListingDraftValues>(emptyDraftValues());
  const [imagePool, setImagePool] = useState<CrossListingImageEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persistedDraftId, setPersistedDraftId] = useState<string | null>(null);
  /** Amazon-Multi-Country: default DE, wechselt auf aktiviertes Land wenn ausgewählt. */
  const [amazonCountrySlug, setAmazonCountrySlug] = useState<string>(DEFAULT_AMAZON_SLUG);

  const { data: sourceData, loading: sourceLoading, error: sourceError } = useCrossListingSourceData(
    open && sku ? sku : null
  );
  const { state: optState, optimize, markApplied, reset: resetOptimize } = useCrossListingOptimize();
  const { state: submitState, submit, reset: resetSubmit } = useCrossListingSubmit();

  useEffect(() => {
    if (!open) {
      resetOptimize();
      resetSubmit();
      setPersistedDraftId(null);
    } else if (existingDraft?.id) {
      setPersistedDraftId(existingDraft.id);
    }
  }, [open, existingDraft, resetOptimize, resetSubmit]);

  const config = targetSlug ? getCrossListingFieldConfig(targetSlug) : null;
  const meta = targetSlug ? resolveMarketplaceMeta(targetSlug) : null;

  const merged = useMemo(() => {
    if (!sourceData || !targetSlug || !config) return null;
    return mergeForTarget(sourceData.sources, targetSlug, config);
  }, [sourceData, targetSlug, config]);

  useEffect(() => {
    if (!open || !targetSlug) return;
    let vals: CrossListingDraftValues;
    if (existingDraft?.userEdits) {
      vals = existingDraft.userEdits;
    } else if (existingDraft?.generatedListing) {
      vals = existingDraft.generatedListing;
    } else if (merged) {
      vals = optimizeForTarget(merged.values, targetSlug).values;
    } else {
      return;
    }
    // Re-seed: Draft-Werte aus bestehendem Draft bleiben, aber LEERE Felder
    // werden aus dem frischen Merge gefüllt (z. B. wenn der Draft vor einem
    // Enrichment-Fix angelegt wurde und Felder fehlen).
    if (merged) {
      const fresh = merged.values;
      const isEmptyStr = (s: unknown) => typeof s !== "string" || s.trim().length === 0;
      const isEmptyArr = (a: unknown) => !Array.isArray(a) || a.length === 0;
      vals = {
        ...vals,
        ean: isEmptyStr(vals.ean) ? fresh.ean : vals.ean,
        brand: isEmptyStr(vals.brand) ? fresh.brand : vals.brand,
        priceEur: isEmptyStr(vals.priceEur) ? fresh.priceEur : vals.priceEur,
        uvpEur: isEmptyStr(vals.uvpEur) ? fresh.uvpEur : vals.uvpEur,
        stockQty: isEmptyStr(vals.stockQty) ? fresh.stockQty : vals.stockQty,
        category: isEmptyStr(vals.category) ? fresh.category : vals.category,
        title: isEmptyStr(vals.title) ? fresh.title : vals.title,
        description: isEmptyStr(vals.description) ? fresh.description : vals.description,
        bullets: isEmptyArr(vals.bullets) ? fresh.bullets : vals.bullets,
        images: isEmptyArr(vals.images) ? fresh.images : vals.images,
        dimL: isEmptyStr(vals.dimL) ? fresh.dimL : vals.dimL,
        dimW: isEmptyStr(vals.dimW) ? fresh.dimW : vals.dimW,
        dimH: isEmptyStr(vals.dimH) ? fresh.dimH : vals.dimH,
        weight: isEmptyStr(vals.weight) ? fresh.weight : vals.weight,
        petSpecies: isEmptyStr(vals.petSpecies) ? fresh.petSpecies : vals.petSpecies,
        tags: isEmptyArr(vals.tags) ? fresh.tags : vals.tags,
        attributes:
          Object.keys(vals.attributes ?? {}).length === 0 ? fresh.attributes : vals.attributes,
      };
    }
    // Amazon: Produkttyp + Browse-Node + alle Compliance-Defaults automatisch setzen
    if (targetSlug === "amazon") {
      // Produkttyp erkennen
      const pt = vals.amazonProductType || detectAmazonProductType(vals.title, vals.description).productType;
      // Browse-Node erkennen
      const bn = detectBrowseNode(pt, vals.title, vals.description);
      // Modellname: Titel ohne Markenpräfix
      const modelName = vals.title?.replace(new RegExp(`^${vals.brand}\\s+`, "i"), "").trim() || vals.title;

      const defaults: Record<string, string> = {
        recommended_browse_nodes: bn.nodeId,
        model_number: sku ?? "",
        model_name: modelName,
        manufacturer: vals.brand || "",
        country_of_origin: "Deutschland",
        supplier_declared_dg_hz_regulation: "Nicht zutreffend",
        batteries_required: "Nein",
        batteries_included: "Nein",
        "epr_product_packaging.main_material": "Papier",
        warranty_description: "Gesetzliche Gewährleistung",
        unit_count: "1",
        unit_count_type: "Stück",
        included_components: `1x ${vals.title || "Produkt"}`,
        directions: "Siehe Produktverpackung",
        specific_uses_for_product: vals.petSpecies || "Haustiere",
        color: "Mehrfarbig",
      };
      // User-Werte überschreiben Defaults
      const seeded = { ...defaults };
      for (const [k, v] of Object.entries(vals.attributes ?? {})) {
        if (v) seeded[k] = v;
      }
      vals = { ...vals, amazonProductType: pt, attributes: seeded };
    }
    // Fressnapf: Marktplatz-spezifische Pflichtattribute mit Smart-Defaults
    // (country_of_origin, material, color, net_weight, variant_group_code, ...)
    // damit Fressnapf.at sie nicht mit dem Markennamen auto-befüllt und ablehnt.
    if (targetSlug === "fressnapf" && sourceData) {
      vals = {
        ...vals,
        attributes: augmentRequiredAttributes(
          targetSlug,
          vals,
          sourceData.sources,
          sku ?? ""
        ),
      };
    }
    setValues(vals);
  }, [open, existingDraft, merged, targetSlug, sku, sourceData]);

  // Bilder-Pool aus allen Quellen + eventuelle bestehende Draft-URLs
  useEffect(() => {
    if (!open || !targetSlug || !sourceData) return;
    const existingUrls =
      existingDraft?.userEdits?.images ?? existingDraft?.generatedListing?.images ?? [];
    const pool = buildImagePool(sourceData.sources, targetSlug, {
      maxItems: (config?.fields.find((f) => f.key === "images")?.maxItems ?? 10) * 3,
    });
    const merged = mergeExistingImagesIntoPool(pool, existingUrls);
    setImagePool(merged);
  }, [open, targetSlug, sourceData, existingDraft, config]);

  const missing = config
    ? getMissing({ ...values, images: selectedImageUrls(imagePool) }, config.fields)
    : [];
  const canSave = !sourceLoading && !saving && !!config;

  function handleApplySuggestion(fieldKey: CrossListingFieldDef["key"]) {
    const result = optState.result;
    if (!result) return;
    if (fieldKey === "title" && result.improvedTitle) {
      setValues((v) => ({ ...v, title: result.improvedTitle! }));
      markApplied("title");
    } else if (fieldKey === "description" && result.improvedDescription) {
      setValues((v) => ({ ...v, description: result.improvedDescription! }));
      markApplied("description");
    } else if (fieldKey === "bullets" && result.improvedBullets) {
      setValues((v) => ({ ...v, bullets: [...result.improvedBullets!] }));
      markApplied("bullets");
    }
  }

  function handleApplyAll() {
    const result = optState.result;
    if (!result) return;
    setValues((v) => {
      let next = { ...v };
      if (result.improvedTitle) next = { ...next, title: result.improvedTitle };
      if (result.improvedDescription) next = { ...next, description: result.improvedDescription };
      if (result.improvedBullets) next = { ...next, bullets: [...result.improvedBullets] };
      return next;
    });
    if (result.improvedTitle) markApplied("title");
    if (result.improvedDescription) markApplied("description");
    if (result.improvedBullets) markApplied("bullets");
  }

  async function handleOptimize() {
    if (!sku || !targetSlug || !sourceData) return;
    await optimize({
      sku,
      targetMarketplace: targetSlug,
      mergedValues: values,
      sourceData: sourceData.sources,
      ...(targetSlug === "amazon" ? { amazonCountrySlug } : {}),
    });
  }

  async function persistDraft(): Promise<string | null> {
    if (!sku || !targetSlug || !sourceData) return null;
    const pickedSource: CrossListingSourceSlug =
      (merged && Object.values(merged.fieldSources)[0]) || "xentral";
    const valuesWithImages: CrossListingDraftValues = {
      ...values,
      images: selectedImageUrls(imagePool),
    };
    const shouldPut = Boolean(existingDraft || persistedDraftId);
    const putId = existingDraft?.id ?? persistedDraftId ?? null;
    const res = shouldPut && putId
      ? await fetch("/api/cross-listing/drafts", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: putId, user_edits: valuesWithImages, status: "reviewing" }),
        })
      : await fetch("/api/cross-listing/drafts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sku,
            ean: sourceData.ean,
            target_marketplace_slug: targetSlug,
            source_marketplace_slug: pickedSource,
            source_data: sourceData.sources,
            generated_listing: merged?.values ?? valuesWithImages,
            user_edits: valuesWithImages,
            status: "reviewing",
          }),
        });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    const body = (await res.json().catch(() => null)) as { draft?: { id?: string } } | null;
    const newId = body?.draft?.id ?? putId;
    if (newId) setPersistedDraftId(newId);
    return newId ?? null;
  }

  async function handleSave() {
    if (!sku || !targetSlug || !sourceData) return;
    setSaving(true);
    setError(null);
    try {
      await persistDraft();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload() {
    if (!targetSlug) return;
    setError(null);
    // Auto-Save: aktueller Stand wird vor dem Upload persistiert damit der
    // Submit-Endpoint die neuesten Werte sieht (auch bei unsaved edits).
    setSaving(true);
    let draftId: string | null = null;
    try {
      draftId = await persistDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
      setSaving(false);
      return;
    }
    setSaving(false);
    if (!draftId) {
      setError(t("crossListing.upload.saveFirst"));
      return;
    }
    await submit({
      draftId,
      targetMarketplaceSlug: targetSlug,
      ...(targetSlug === "amazon"
        ? {
            productType: values.amazonProductType || "PET_SUPPLIES",
            amazonCountrySlug,
          }
        : {}),
    });
  }

  if (!open || !sku || !targetSlug || !config || !meta) {
    return (
      <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
        {/* no content */}
      </Dialog>
    );
  }

  const ctx: EditorCtx = {
    sku,
    targetSlug,
    config,
    values,
    setValues,
    imagePool,
    setImagePool,
    fieldSources: merged?.fieldSources ?? {},
    sourceData,
    optimization: optState.result,
    applied: optState.applied,
    onApplySuggestion: handleApplySuggestion,
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <MarketplaceProductEditorDialogContent>
        <DialogHeader className={MARKETPLACE_PRODUCT_EDITOR_HEADER_CLASS}>
          <DialogTitle className={MARKETPLACE_PRODUCT_EDITOR_TITLE_CLASS}>
            {meta.logo && (
              <span className={MARKETPLACE_PRODUCT_EDITOR_LOGO_WRAP_CLASS}>
                <Image
                  src={meta.logo}
                  alt={meta.label}
                  width={68}
                  height={24}
                  className={MARKETPLACE_PRODUCT_EDITOR_LOGO_IMG_CLASS}
                  unoptimized
                />
              </span>
            )}
            <span>{t("crossListing.dialog.title", { marketplace: meta.label })}</span>
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">SKU: {sku}</span>
          </DialogTitle>
        </DialogHeader>

        <div className={MARKETPLACE_PRODUCT_EDITOR_SCROLL_OUTER_CLASS}>
          <div className={`${MARKETPLACE_PRODUCT_EDITOR_BODY_PADDING_CLASS} flex flex-col gap-2`}>
            {sourceLoading && <p className={MARKETPLACE_PRODUCT_EDITOR_HINT}>{t("crossListing.loading")}</p>}
            {sourceError && (
              <p className="rounded-md border border-rose-400 bg-rose-50 p-1.5 text-[11px] text-rose-700 dark:bg-rose-950/30">
                {sourceError}
              </p>
            )}
            {config.platformHintKey && (
              <p className={MARKETPLACE_PRODUCT_EDITOR_HINT}>{t(config.platformHintKey)}</p>
            )}
            <CrossListingAiBlock
              loading={optState.loading}
              error={optState.error}
              result={optState.result}
              applied={optState.applied}
              disabled={sourceLoading || saving || !sourceData}
              onOptimize={() => void handleOptimize()}
              onApplyAll={handleApplyAll}
            />
            {targetSlug === "amazon" && (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white p-2 text-xs dark:border-gray-800 dark:bg-card">
                  <span className="font-semibold text-black dark:text-white">Zielland</span>
                  <Select
                    value={amazonCountrySlug}
                    onValueChange={(value) => setAmazonCountrySlug(value ?? DEFAULT_AMAZON_SLUG)}
                  >
                    <SelectTrigger className="h-7 w-56 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AMAZON_EU_MARKETPLACES.map((m) => (
                        <SelectItem key={m.slug} value={m.slug} className="text-xs">
                          {m.countryFlag} {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-muted-foreground">
                    Content wird in der Zielsprache generiert (language_tag der ausgewählten Amazon-Domain).
                  </span>
                </div>
                <CrossListingAmazonFields values={values} setValues={setValues} sku={sku} />
              </>
            )}
            <CrossListingEditorBody ctx={ctx} />
            {(submitState.result || submitState.error) && (
              <div
                className={`rounded-md border p-2 text-[11px] ${
                  submitState.result?.ok
                    ? submitState.result.preparedOnly
                      ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/30"
                      : "border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30"
                    : "border-rose-400 bg-rose-50 text-rose-800 dark:bg-rose-950/30"
                }`}
              >
                {submitState.error && <p>{submitState.error}</p>}
                {submitState.result && (
                  <>
                    <p>
                      <strong>{submitState.result.status}</strong>
                      {submitState.result.submissionId && ` · ID ${submitState.result.submissionId}`}
                      {submitState.result.sandbox && " · sandbox"}
                    </p>
                    {submitState.result.preparedOnly && submitState.result.preparedMessage && (
                      <p className="mt-1">{submitState.result.preparedMessage}</p>
                    )}
                    {submitState.result.aiReport?.ran && (
                      <p className="mt-1 text-muted-foreground">
                        {submitState.result.aiReport.changed
                          ? t("crossListing.submit.aiChanged")
                          : t("crossListing.submit.aiNoChange")}
                        {submitState.result.aiReport.summary
                          ? ` — ${submitState.result.aiReport.summary.slice(0, 200)}`
                          : ""}
                      </p>
                    )}
                    {submitState.result.issues.length > 0 && (
                      <ul className="mt-1 list-disc pl-4">
                        {submitState.result.issues.map((iss, idx) => (
                          <li key={idx}>
                            <span className="font-mono text-[10px]">[{iss.severity}]</span> {iss.message}
                            {iss.attributeNames && iss.attributeNames.length > 0 && (
                              <span className="text-muted-foreground"> · {iss.attributeNames.join(", ")}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <CrossListingFooter
          missing={missing}
          error={error}
          saving={saving}
          canSave={canSave}
          uploadEnabled={
            missing.length === 0 &&
            !!sourceData &&
            (targetSlug !== "amazon" ||
              validateForAmazonSubmit(values, values.amazonProductType || "PET_SUPPLIES").valid)
          }
          uploading={submitState.loading}
          persistedDraftId={persistedDraftId}
          onClose={onClose}
          onSave={() => void handleSave()}
          onUpload={() => void handleUpload()}
        />
      </MarketplaceProductEditorDialogContent>
    </Dialog>
  );
}
