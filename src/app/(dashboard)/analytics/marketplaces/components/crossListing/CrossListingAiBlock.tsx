"use client";

import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MARKETPLACE_PRODUCT_EDITOR_H3,
  MARKETPLACE_PRODUCT_EDITOR_HINT,
  MARKETPLACE_PRODUCT_EDITOR_SECTION,
} from "@/shared/lib/marketplaceProductEditorTokens";
import type { CrossListingLlmResult } from "@/shared/lib/crossListing/crossListingLlmOptimize";
import type { OptimizeFieldKey } from "@/shared/hooks/useCrossListingOptimize";
import { useTranslation } from "@/i18n/I18nProvider";

type Props = {
  loading: boolean;
  error: string | null;
  result: CrossListingLlmResult | null;
  applied: ReadonlySet<OptimizeFieldKey>;
  disabled: boolean;
  onOptimize: () => void;
  onApplyAll: () => void;
};

export function CrossListingAiBlock({
  loading,
  error,
  result,
  applied,
  disabled,
  onOptimize,
  onApplyAll,
}: Props) {
  const { t } = useTranslation();

  const hasAnyOpenSuggestion = Boolean(
    result &&
      ((result.improvedTitle && !applied.has("title")) ||
        (result.improvedDescription && !applied.has("description")) ||
        (result.improvedBullets && !applied.has("bullets")))
  );

  return (
    <div className={`${MARKETPLACE_PRODUCT_EDITOR_SECTION} flex flex-col gap-1`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={MARKETPLACE_PRODUCT_EDITOR_H3}>{t("crossListing.ai.title")}</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-6 gap-1 px-2 text-[10px]"
          disabled={disabled || loading}
          onClick={onOptimize}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-3 w-3" aria-hidden />
          )}
          {t("crossListing.ai.optimizeButton")}
        </Button>
        {hasAnyOpenSuggestion && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={onApplyAll}
          >
            {t("crossListing.ai.applyAll")}
          </Button>
        )}
      </div>
      {loading && <p className={MARKETPLACE_PRODUCT_EDITOR_HINT}>{t("crossListing.ai.loading")}</p>}
      {error && (
        <p className="text-[10px] text-rose-600">
          {t("crossListing.ai.error")}: {error}
        </p>
      )}
      {result && !error && !loading && (
        <>
          {result.summary && <p className={MARKETPLACE_PRODUCT_EDITOR_HINT}>{result.summary}</p>}
          {result.noMaterialImprovement && (
            <p className="text-[10px] text-muted-foreground">
              {t("crossListing.ai.noImprovement")}
            </p>
          )}
          {result.llmSkippedReason && (
            <p className="text-[10px] text-amber-600">
              {t("crossListing.ai.skipped")}: {result.llmSkippedReason}
            </p>
          )}
        </>
      )}
    </div>
  );
}
