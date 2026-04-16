"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MARKETPLACE_PRODUCT_EDITOR_CONTROL,
  MARKETPLACE_PRODUCT_EDITOR_FIELD,
  MARKETPLACE_PRODUCT_EDITOR_H3,
  MARKETPLACE_PRODUCT_EDITOR_HINT,
  MARKETPLACE_PRODUCT_EDITOR_SECTION,
} from "@/shared/lib/marketplaceProductEditorTokens";
import type { CrossListingFieldDef } from "@/shared/lib/crossListing/crossListingDraftTypes";
import { CrossListingSourceChip } from "./CrossListingSourceChip";
import type { EditorCtx } from "./types";
import { useTranslation } from "@/i18n/I18nProvider";

export function CrossListingAttributeEditor({
  field,
  ctx,
}: {
  field: CrossListingFieldDef;
  ctx: EditorCtx;
}) {
  const { t } = useTranslation();
  const { values, setValues, fieldSources } = ctx;

  return (
    <div className={MARKETPLACE_PRODUCT_EDITOR_SECTION}>
      <div className="flex items-center">
        <span className={MARKETPLACE_PRODUCT_EDITOR_H3}>{t(field.labelKey)}</span>
        <CrossListingSourceChip fieldKey={field.key} fieldSources={fieldSources} />
      </div>
      {field.hintKey && <p className={MARKETPLACE_PRODUCT_EDITOR_HINT}>{t(field.hintKey)}</p>}
      <div className="mt-1 flex flex-col gap-0.5">
        {Object.entries(values.attributes).map(([k, v]) => (
          <div key={k} className="flex gap-1">
            <Input
              className={`${MARKETPLACE_PRODUCT_EDITOR_CONTROL} ${MARKETPLACE_PRODUCT_EDITOR_FIELD} w-40`}
              value={k}
              readOnly
            />
            <Input
              className={`${MARKETPLACE_PRODUCT_EDITOR_CONTROL} ${MARKETPLACE_PRODUCT_EDITOR_FIELD} flex-1`}
              value={v}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  attributes: { ...prev.attributes, [k]: e.target.value },
                }))
              }
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5"
              onClick={() =>
                setValues((prev) => {
                  const next = { ...prev.attributes };
                  delete next[k];
                  return { ...prev, attributes: next };
                })
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
