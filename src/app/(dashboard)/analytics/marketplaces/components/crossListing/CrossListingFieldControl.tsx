"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MARKETPLACE_PRODUCT_EDITOR_CONTROL,
  MARKETPLACE_PRODUCT_EDITOR_FIELD,
  MARKETPLACE_PRODUCT_EDITOR_HINT,
  MARKETPLACE_PRODUCT_EDITOR_LABEL,
} from "@/shared/lib/marketplaceProductEditorTokens";
import type {
  CrossListingDraftValues,
  CrossListingFieldDef,
} from "@/shared/lib/crossListing/crossListingDraftTypes";
import { CrossListingSourceChip } from "./CrossListingSourceChip";
import { CrossListingAiChip } from "./CrossListingAiChip";
import { CrossListingBulletList } from "./CrossListingBulletList";
import { CrossListingImageGrid } from "./CrossListingImageGrid";
import { CrossListingTagsInput } from "./CrossListingTagsInput";
import { CrossListingAttributeEditor } from "./CrossListingAttributeEditor";
import type { EditorCtx } from "./types";
import { useTranslation } from "@/i18n/I18nProvider";

function readString(values: CrossListingDraftValues, key: CrossListingFieldDef["key"]): string {
  const raw = (values as unknown as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : "";
}

function writeString(
  setValues: EditorCtx["setValues"],
  key: CrossListingFieldDef["key"],
  next: string
) {
  setValues((v) => ({ ...(v as unknown as Record<string, unknown>), [key]: next } as CrossListingDraftValues));
}

export function CrossListingFieldControl({
  field,
  ctx,
}: {
  field: CrossListingFieldDef;
  ctx: EditorCtx;
}) {
  const { t } = useTranslation();
  const { values, setValues, fieldSources, optimization, applied, onApplySuggestion } = ctx;
  const label = t(field.labelKey);

  const headerExtras = (
    <>
      {field.unit && <span className="ml-1 text-[9px] text-muted-foreground">({field.unit})</span>}
      {field.required && <span className="ml-0.5 text-rose-500">*</span>}
      <CrossListingSourceChip fieldKey={field.key} fieldSources={fieldSources} />
      <CrossListingAiChip
        fieldKey={field.key}
        optimization={optimization}
        applied={applied}
        onApply={onApplySuggestion}
      />
    </>
  );

  switch (field.type) {
    case "text":
      return (
        <label className={MARKETPLACE_PRODUCT_EDITOR_LABEL}>
          <span className="flex items-center">
            {label}
            {headerExtras}
          </span>
          <Input
            className={`${MARKETPLACE_PRODUCT_EDITOR_CONTROL} ${MARKETPLACE_PRODUCT_EDITOR_FIELD}`}
            value={readString(values, field.key)}
            maxLength={field.maxLength}
            onChange={(e) => writeString(setValues, field.key, e.target.value)}
          />
          {field.hintKey && <span className={MARKETPLACE_PRODUCT_EDITOR_HINT}>{t(field.hintKey)}</span>}
        </label>
      );
    case "textarea":
      return (
        <label className={MARKETPLACE_PRODUCT_EDITOR_LABEL}>
          <span className="flex items-center">
            {label}
            {headerExtras}
          </span>
          <Textarea
            className={`min-h-24 ${MARKETPLACE_PRODUCT_EDITOR_FIELD}`}
            value={readString(values, field.key)}
            maxLength={field.maxLength}
            onChange={(e) => writeString(setValues, field.key, e.target.value)}
          />
        </label>
      );
    case "number":
      return (
        <label className={MARKETPLACE_PRODUCT_EDITOR_LABEL}>
          <span className="flex items-center">
            {label}
            {headerExtras}
          </span>
          <Input
            className={`${MARKETPLACE_PRODUCT_EDITOR_CONTROL} ${MARKETPLACE_PRODUCT_EDITOR_FIELD}`}
            type="number"
            step="0.01"
            value={readString(values, field.key)}
            onChange={(e) => writeString(setValues, field.key, e.target.value)}
          />
        </label>
      );
    case "select":
      return (
        <label className={MARKETPLACE_PRODUCT_EDITOR_LABEL}>
          <span className="flex items-center">
            {label}
            {field.required && <span className="ml-0.5 text-rose-500">*</span>}
            <CrossListingSourceChip fieldKey={field.key} fieldSources={fieldSources} />
          </span>
          <select
            className={`${MARKETPLACE_PRODUCT_EDITOR_CONTROL} rounded-md border border-border bg-background`}
            value={readString(values, field.key)}
            onChange={(e) => writeString(setValues, field.key, e.target.value)}
          >
            <option value="">—</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
    case "bullets":
      return <CrossListingBulletList field={field} ctx={ctx} />;
    case "images":
      return <CrossListingImageGrid field={field} ctx={ctx} />;
    case "tags":
      return <CrossListingTagsInput field={field} ctx={ctx} />;
    case "attributes":
      return <CrossListingAttributeEditor field={field} ctx={ctx} />;
  }
}
