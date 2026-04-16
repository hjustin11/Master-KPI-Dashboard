"use client";

import { useMemo } from "react";
import type { CrossListingFieldDef, CrossListingFieldSection } from "@/shared/lib/crossListing/crossListingDraftTypes";
import { CrossListingFieldGroup } from "./CrossListingFieldGroup";
import type { EditorCtx } from "./types";

function groupBySection(fields: readonly CrossListingFieldDef[]) {
  const buckets: Record<CrossListingFieldSection, CrossListingFieldDef[]> = {
    catalog: [],
    content: [],
    images: [],
    platform: [],
  };
  for (const f of fields) {
    const s = f.section ?? "content";
    buckets[s].push(f);
  }
  return buckets;
}

export function CrossListingEditorBody({ ctx }: { ctx: EditorCtx }) {
  const groups = useMemo(() => groupBySection(ctx.config.fields), [ctx.config.fields]);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:flex-row lg:items-stretch">
      {/* Left column: Stammdaten / Katalog */}
      <div className="flex flex-1 flex-col gap-2 min-w-0">
        <CrossListingFieldGroup
          labelKey="crossListing.section.catalog"
          fields={groups.catalog}
          ctx={ctx}
          compact
        />
        <CrossListingFieldGroup
          labelKey="crossListing.section.platform"
          fields={groups.platform}
          ctx={ctx}
        />
      </div>
      {/* Right column: Content + Bilder */}
      <div className="flex flex-1 flex-col gap-2 min-w-0">
        <CrossListingFieldGroup
          labelKey="crossListing.section.content"
          fields={groups.content}
          ctx={ctx}
        />
        <CrossListingFieldGroup
          labelKey="crossListing.section.images"
          fields={groups.images}
          ctx={ctx}
        />
      </div>
    </div>
  );
}
