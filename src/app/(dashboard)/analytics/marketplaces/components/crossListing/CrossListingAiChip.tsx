"use client";

import { Badge } from "@/components/ui/badge";
import type { CrossListingFieldDef } from "@/shared/lib/crossListing/crossListingDraftTypes";
import type { CrossListingLlmResult } from "@/shared/lib/crossListing/crossListingLlmOptimize";
import type { OptimizeFieldKey } from "@/shared/hooks/useCrossListingOptimize";
import { useTranslation } from "@/i18n/I18nProvider";

const FIELD_MAP: Partial<Record<CrossListingFieldDef["key"], OptimizeFieldKey>> = {
  title: "title",
  description: "description",
  bullets: "bullets",
};

export function CrossListingAiChip({
  fieldKey,
  optimization,
  applied,
  onApply,
}: {
  fieldKey: CrossListingFieldDef["key"];
  optimization: CrossListingLlmResult | null;
  applied: ReadonlySet<OptimizeFieldKey>;
  onApply: (key: CrossListingFieldDef["key"]) => void;
}) {
  const { t } = useTranslation();
  if (!optimization) return null;
  const mapped = FIELD_MAP[fieldKey];
  if (!mapped) return null;
  const improved =
    mapped === "title"
      ? optimization.improvedTitle
      : mapped === "description"
        ? optimization.improvedDescription
        : optimization.improvedBullets;
  if (improved == null) return null;
  const reason =
    mapped === "title"
      ? optimization.titleReason
      : mapped === "description"
        ? optimization.descriptionReason
        : optimization.bulletsReason;

  if (applied.has(mapped)) {
    return (
      <Badge
        variant="secondary"
        className="ml-1.5 h-4 border-emerald-300 bg-emerald-50 px-1 text-[9px] font-normal text-emerald-800 dark:bg-emerald-950/40"
      >
        {t("crossListing.ai.applied")}
      </Badge>
    );
  }

  return (
    <>
      <Badge
        variant="secondary"
        className="ml-1.5 h-4 border-violet-300 bg-violet-50 px-1 text-[9px] font-normal text-violet-800 dark:bg-violet-950/40"
        title={reason || undefined}
      >
        {t("crossListing.ai.suggestion")}
      </Badge>
      <button
        type="button"
        className="ml-1 text-[9px] font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
        onClick={() => onApply(fieldKey)}
      >
        {t("crossListing.ai.apply")}
      </button>
    </>
  );
}
