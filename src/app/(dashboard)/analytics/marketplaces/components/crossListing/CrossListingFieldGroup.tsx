"use client";

import { MARKETPLACE_PRODUCT_EDITOR_H3 } from "@/shared/lib/marketplaceProductEditorTokens";
import type { CrossListingFieldDef } from "@/shared/lib/crossListing/crossListingDraftTypes";
import { CrossListingFieldControl } from "./CrossListingFieldControl";
import type { EditorCtx } from "./types";
import { useTranslation } from "@/i18n/I18nProvider";

export function CrossListingFieldGroup({
  labelKey,
  fields,
  ctx,
  compact,
}: {
  labelKey: string;
  fields: readonly CrossListingFieldDef[];
  ctx: EditorCtx;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (fields.length === 0) return null;

  return (
    <section className="flex flex-col gap-1">
      <h4 className={`${MARKETPLACE_PRODUCT_EDITOR_H3} text-muted-foreground`}>{t(labelKey)}</h4>
      <div
        className={
          compact
            ? "grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3"
            : "flex flex-col gap-1"
        }
      >
        {fields.map((f) => (
          <CrossListingFieldControl key={f.key} field={f} ctx={ctx} />
        ))}
      </div>
    </section>
  );
}
