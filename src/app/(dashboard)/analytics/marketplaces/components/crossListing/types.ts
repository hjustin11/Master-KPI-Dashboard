import type {
  CrossListingDraftValues,
  CrossListingFieldConfig,
  CrossListingFieldDef,
  CrossListingFieldSection,
  CrossListingFieldSources,
  CrossListingImageEntry,
  CrossListingSourceDataResponse,
  CrossListingSourceSlug,
  CrossListingTargetSlug,
} from "@/shared/lib/crossListing/crossListingDraftTypes";
import type { CrossListingLlmResult } from "@/shared/lib/crossListing/crossListingLlmOptimize";
import type { OptimizeFieldKey } from "@/shared/hooks/useCrossListingOptimize";

export type EditorCtx = {
  sku: string;
  targetSlug: CrossListingTargetSlug;
  config: CrossListingFieldConfig;
  values: CrossListingDraftValues;
  setValues: React.Dispatch<React.SetStateAction<CrossListingDraftValues>>;
  fieldSources: CrossListingFieldSources;
  sourceData: CrossListingSourceDataResponse | null;
  optimization: CrossListingLlmResult | null;
  applied: ReadonlySet<OptimizeFieldKey>;
  onApplySuggestion: (fieldKey: CrossListingFieldDef["key"]) => void;
  imagePool: CrossListingImageEntry[];
  setImagePool: React.Dispatch<React.SetStateAction<CrossListingImageEntry[]>>;
};

export type { CrossListingFieldSection, CrossListingSourceSlug };
