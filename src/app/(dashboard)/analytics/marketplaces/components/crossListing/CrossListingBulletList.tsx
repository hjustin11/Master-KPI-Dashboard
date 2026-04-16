"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MARKETPLACE_PRODUCT_EDITOR_CONTROL,
  MARKETPLACE_PRODUCT_EDITOR_FIELD,
  MARKETPLACE_PRODUCT_EDITOR_H3,
  MARKETPLACE_PRODUCT_EDITOR_SECTION,
} from "@/shared/lib/marketplaceProductEditorTokens";
import type { CrossListingFieldDef } from "@/shared/lib/crossListing/crossListingDraftTypes";
import { CrossListingSourceChip } from "./CrossListingSourceChip";
import { CrossListingAiChip } from "./CrossListingAiChip";
import type { EditorCtx } from "./types";
import { useTranslation } from "@/i18n/I18nProvider";

export function CrossListingBulletList({
  field,
  ctx,
}: {
  field: CrossListingFieldDef;
  ctx: EditorCtx;
}) {
  const { t } = useTranslation();
  const { values, setValues, fieldSources, optimization, applied, onApplySuggestion } = ctx;
  const label = t(field.labelKey);

  return (
    <div className={MARKETPLACE_PRODUCT_EDITOR_SECTION}>
      <div className="flex items-center justify-between">
        <span className={MARKETPLACE_PRODUCT_EDITOR_H3}>
          {label}
          {field.required && <span className="ml-0.5 text-rose-500">*</span>}
          <CrossListingSourceChip fieldKey={field.key} fieldSources={fieldSources} />
          <CrossListingAiChip
            fieldKey={field.key}
            optimization={optimization}
            applied={applied}
            onApply={onApplySuggestion}
          />
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1.5 text-[10px]"
          onClick={() =>
            setValues((v) => ({
              ...v,
              bullets: [...v.bullets, ""].slice(0, field.maxItems ?? 10),
            }))
          }
        >
          + {t("crossListing.action.addBullet")}
        </Button>
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        {values.bullets.map((b, i) => (
          <div key={i} className="flex gap-1">
            <Input
              className={`${MARKETPLACE_PRODUCT_EDITOR_CONTROL} ${MARKETPLACE_PRODUCT_EDITOR_FIELD}`}
              value={b}
              maxLength={field.maxLength}
              onChange={(e) =>
                setValues((v) => {
                  const next = [...v.bullets];
                  next[i] = e.target.value;
                  return { ...v, bullets: next };
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5"
              onClick={() =>
                setValues((v) => ({ ...v, bullets: v.bullets.filter((_, j) => j !== i) }))
              }
            >
              ×
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
