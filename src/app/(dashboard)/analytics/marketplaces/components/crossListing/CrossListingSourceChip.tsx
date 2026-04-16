"use client";

import { Badge } from "@/components/ui/badge";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";
import type {
  CrossListingFieldDef,
  CrossListingFieldSources,
  CrossListingSourceSlug,
} from "@/shared/lib/crossListing/crossListingDraftTypes";
import { useTranslation } from "@/i18n/I18nProvider";

function sourceLabel(slug: CrossListingSourceSlug): string {
  if (slug === "amazon") return "Amazon";
  if (slug === "xentral") return "Xentral";
  return ANALYTICS_MARKETPLACES.find((x) => x.slug === slug)?.label ?? slug;
}

export function CrossListingSourceChip({
  fieldKey,
  fieldSources,
}: {
  fieldKey: CrossListingFieldDef["key"];
  fieldSources: CrossListingFieldSources;
}) {
  const { t } = useTranslation();
  const src = fieldSources[fieldKey];
  if (!src) return null;
  return (
    <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[9px] font-normal">
      {t("crossListing.source")}: {sourceLabel(src)}
    </Badge>
  );
}
