"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";
import {
  MARKETPLACE_PRODUCT_EDITOR_CONTROL,
  MARKETPLACE_PRODUCT_EDITOR_FIELD,
  MARKETPLACE_PRODUCT_EDITOR_H3,
  MARKETPLACE_PRODUCT_EDITOR_HINT,
  MARKETPLACE_PRODUCT_EDITOR_SECTION,
} from "@/shared/lib/marketplaceProductEditorTokens";
import type {
  CrossListingFieldDef,
  CrossListingImageEntry,
} from "@/shared/lib/crossListing/crossListingDraftTypes";
import type { EditorCtx } from "./types";
import { CrossListingImageLightbox } from "./CrossListingImageLightbox";
import { useTranslation } from "@/i18n/I18nProvider";

function labelForSource(source: CrossListingImageEntry["source"]): string {
  if (source === "manual") return "Manuell";
  if (source === "amazon") return "Amazon";
  if (source === "xentral") return "Xentral";
  return ANALYTICS_MARKETPLACES.find((m) => m.slug === source)?.label ?? source;
}

export function CrossListingImageGrid({
  field,
  ctx,
}: {
  field: CrossListingFieldDef;
  ctx: EditorCtx;
}) {
  const { t } = useTranslation();
  const { imagePool, setImagePool } = ctx;
  const max = field.maxItems ?? 10;
  const selectedCount = imagePool.filter((e) => e.selected).length;
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  function toggleSelect(index: number) {
    setImagePool((prev) => {
      const next = prev.map((e, i) => (i === index ? { ...e, selected: !e.selected } : e));
      const selected = next.filter((e) => e.selected).length;
      if (selected > max) {
        // Letzte Auswahl zurücknehmen wenn Limit überschritten.
        const lastSelectedIdx = next
          .map((e, idx) => (e.selected ? idx : -1))
          .reverse()
          .find((idx) => idx !== -1);
        if (lastSelectedIdx !== undefined && lastSelectedIdx !== index) return prev;
      }
      return next;
    });
  }

  function removeEntry(index: number) {
    setImagePool((prev) => prev.filter((_, i) => i !== index));
  }

  function addManualUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    setImagePool((prev) => {
      if (prev.some((e) => e.url === trimmed)) return prev;
      const maxIdx = prev
        .filter((e) => e.source === "manual")
        .reduce((acc, e) => Math.max(acc, e.index), 0);
      return [...prev, { url: trimmed, source: "manual", index: maxIdx + 1, selected: true }];
    });
  }

  return (
    <>
      <div className={MARKETPLACE_PRODUCT_EDITOR_SECTION}>
        <div className="flex items-center justify-between">
          <span className={MARKETPLACE_PRODUCT_EDITOR_H3}>
            {t(field.labelKey)}
            {field.required && <span className="ml-0.5 text-rose-500">*</span>}
          </span>
          <span className={MARKETPLACE_PRODUCT_EDITOR_HINT}>
            {selectedCount} / {max} {t("crossListing.images.selected")}
            {" · "}
            {imagePool.length} {t("crossListing.images.total")}
          </span>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {imagePool.map((entry, i) => (
            <div
              key={`${i}-${entry.url}`}
              className={`relative aspect-square overflow-hidden rounded border bg-background transition ${
                entry.selected ? "border-primary" : "border-border opacity-60"
              }`}
            >
              <button
                type="button"
                className="h-full w-full"
                onClick={() => setLightboxUrl(entry.url)}
                aria-label="open lightbox"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={entry.url} alt="" className="h-full w-full object-contain" />
              </button>
              <div className="absolute left-0 top-0 flex items-center gap-0.5 rounded-br bg-black/60 px-1 py-0.5">
                <input
                  type="checkbox"
                  checked={entry.selected}
                  onChange={() => toggleSelect(i)}
                  className="h-3 w-3"
                  aria-label="select"
                />
                <Badge
                  variant="secondary"
                  className="h-3.5 border-transparent bg-white/80 px-1 text-[9px] font-normal text-foreground"
                >
                  {labelForSource(entry.source)} {entry.index}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => removeEntry(i)}
                className="absolute right-0 top-0 rounded-bl bg-black/60 px-1 text-[10px] text-white"
                aria-label="remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <Input
          className={`${MARKETPLACE_PRODUCT_EDITOR_CONTROL} ${MARKETPLACE_PRODUCT_EDITOR_FIELD} mt-1`}
          placeholder={t("crossListing.placeholder.imageUrl")}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const input = e.currentTarget;
            addManualUrl(input.value);
            input.value = "";
          }}
        />
      </div>
      <CrossListingImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </>
  );
}
