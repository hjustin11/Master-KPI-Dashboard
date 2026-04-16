"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MARKETPLACE_PRODUCT_EDITOR_CONTROL,
  MARKETPLACE_PRODUCT_EDITOR_FIELD,
  MARKETPLACE_PRODUCT_EDITOR_H3,
  MARKETPLACE_PRODUCT_EDITOR_HINT,
  MARKETPLACE_PRODUCT_EDITOR_SECTION,
} from "@/shared/lib/marketplaceProductEditorTokens";
import type {
  CrossListingDraftValues,
  CrossListingFieldDef,
} from "@/shared/lib/crossListing/crossListingDraftTypes";
import { CrossListingSourceChip } from "./CrossListingSourceChip";
import type { EditorCtx } from "./types";
import { useTranslation } from "@/i18n/I18nProvider";

function readTags(values: CrossListingDraftValues, key: CrossListingFieldDef["key"]): string[] {
  const raw = (values as unknown as Record<string, unknown>)[key];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

export function CrossListingTagsInput({
  field,
  ctx,
}: {
  field: CrossListingFieldDef;
  ctx: EditorCtx;
}) {
  const { t } = useTranslation();
  const { values, setValues, fieldSources } = ctx;
  const max = field.maxItems ?? 20;
  const tags = readTags(values, field.key);

  return (
    <div className={MARKETPLACE_PRODUCT_EDITOR_SECTION}>
      <div className="flex items-center justify-between">
        <span className={MARKETPLACE_PRODUCT_EDITOR_H3}>
          {t(field.labelKey)}
          <CrossListingSourceChip fieldKey={field.key} fieldSources={fieldSources} />
        </span>
        <span className={MARKETPLACE_PRODUCT_EDITOR_HINT}>
          {tags.length}/{max}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {tags.map((tag, i) => (
          <Badge key={`${tag}-${i}`} variant="secondary" className="gap-1 text-[10px]">
            {tag}
            <button
              type="button"
              className="ml-0.5"
              onClick={() =>
                setValues((v) => {
                  const cur = readTags(v, field.key);
                  const next = { ...(v as unknown as Record<string, unknown>) };
                  next[field.key] = cur.filter((_, j) => j !== i);
                  return next as CrossListingDraftValues;
                })
              }
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <Input
        className={`${MARKETPLACE_PRODUCT_EDITOR_CONTROL} ${MARKETPLACE_PRODUCT_EDITOR_FIELD} mt-1`}
        placeholder={t("crossListing.placeholder.tag")}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const input = e.currentTarget;
          const raw = input.value.trim();
          if (!raw) return;
          setValues((v) => {
            const cur = readTags(v, field.key);
            if (cur.includes(raw)) return v;
            const next = { ...(v as unknown as Record<string, unknown>) };
            next[field.key] = [...cur, raw].slice(0, max);
            return next as CrossListingDraftValues;
          });
          input.value = "";
        }}
      />
    </div>
  );
}
