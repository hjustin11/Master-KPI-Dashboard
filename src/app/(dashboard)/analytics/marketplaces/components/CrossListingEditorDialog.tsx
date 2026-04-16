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
import { CrossListingEditorBody } from "./crossListing/CrossListingEditorBody";
import { CrossListingFooter } from "./crossListing/CrossListingFooter";

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
    // Amazon: Pflichtfelder in attributes seeden, damit User sie im Dialog sieht
    if (targetSlug === "amazon") {
      const AMAZON_REQUIRED: Record<string, string> = {
        model_number: sku ?? "",
        color: "Mehrfarbig",
        country_of_origin: "DE",
        unit_count: "1",
        unit_count_type: "Stück",
        recommended_browse_nodes: "",
        power_plug_type: "does_not_require_a_plug",
        accepted_voltage_frequency: "",
        eu_energy_label_efficiency_class: "",
        supplier_declared_dg_hz_regulation: "not_applicable",
        contains_food_or_beverage: "false",
        contains_liquid_contents: "false",
        warranty_description: "Gesetzliche Gewährleistung",
        directions: "Siehe Produktverpackung",
        included_components: vals.title || "",
        efficiency: "Nicht zutreffend",
        specific_uses_for_product: vals.petSpecies || "Haustiere",
      };
      const seeded = { ...AMAZON_REQUIRED };
      for (const [k, v] of Object.entries(vals.attributes ?? {})) {
        if (v) seeded[k] = v;
      }
      vals = { ...vals, attributes: seeded };
    }
    setValues(vals);
  }, [open, existingDraft, merged, targetSlug, sku]);

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
    });
  }

  async function handleSave() {
    if (!sku || !targetSlug || !sourceData) return;
    setSaving(true);
    setError(null);
    try {
      const pickedSource: CrossListingSourceSlug =
        (merged && Object.values(merged.fieldSources)[0]) || "xentral";
      // Bilder aus Pool: nur ausgewählte URLs landen im Draft.
      const valuesWithImages: CrossListingDraftValues = {
        ...values,
        images: selectedImageUrls(imagePool),
      };
      const res = existingDraft
        ? await fetch("/api/cross-listing/drafts", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: existingDraft.id, user_edits: valuesWithImages, status: "reviewing" }),
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
      if (body?.draft?.id) setPersistedDraftId(body.draft.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload() {
    if (!targetSlug || targetSlug !== "amazon") return;
    const draftId = persistedDraftId;
    if (!draftId) {
      setError(t("crossListing.upload.saveFirst"));
      return;
    }
    setError(null);
    await submit({ draftId, targetMarketplaceSlug: targetSlug, productType: "PET_SUPPLIES" });
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
            <CrossListingEditorBody ctx={ctx} />
            {(submitState.result || submitState.error) && (
              <div
                className={`rounded-md border p-2 text-[11px] ${
                  submitState.result?.ok
                    ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30"
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
          uploadEnabled={targetSlug === "amazon" && !!persistedDraftId}
          uploading={submitState.loading}
          onClose={onClose}
          onSave={() => void handleSave()}
          onUpload={() => void handleUpload()}
        />
      </MarketplaceProductEditorDialogContent>
    </Dialog>
  );
}
