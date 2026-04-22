"use client";

import { useState } from "react";
import { AlertTriangle, Languages, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import { languageDisplayName } from "@/shared/components/MarketplaceLanguageBanner";

export type MissingTranslationHintProps = {
  fieldName: string;
  fieldLabel: string;
  targetLanguageTag: string;
  sourceLanguageTag?: string;
  sourceValue?: string;
  /** Optional callback für Phase 5d (KI-Übersetzung). */
  onTranslateClick?: () => void;
  /** Fokussiert das zugehörige Eingabefeld. */
  onManualFocus?: () => void;
  /** Wenn das Feld bereits Content hat, wird nichts angezeigt. */
  hasValue?: boolean;
  className?: string;
};

export function MissingTranslationHint({
  fieldName,
  fieldLabel,
  targetLanguageTag,
  sourceLanguageTag = "de_DE",
  sourceValue,
  onTranslateClick,
  onManualFocus,
  hasValue = false,
  className,
}: MissingTranslationHintProps) {
  const { t } = useTranslation();
  const [manualMode, setManualMode] = useState(false);

  if (hasValue) return null;

  const targetName = languageDisplayName(targetLanguageTag, t);
  const sourceName = languageDisplayName(sourceLanguageTag, t);

  const handleTranslate = () => {
    if (onTranslateClick) {
      onTranslateClick();
    } else {
      toast.info(t("marketplaceLanguage.comingSoonToast"));
    }
  };

  const handleManual = () => {
    setManualMode(true);
    onManualFocus?.();
  };

  return (
    <div
      className={cn(
        "mt-1 rounded-md border border-amber-500/50 bg-amber-100 px-2 py-1.5 text-[10px] text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100",
        className
      )}
      data-testid={`missing-translation-${fieldName}`}
    >
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-3 w-3 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        <span className="font-semibold text-amber-950 dark:text-amber-50">
          {t("marketplaceLanguage.missingHint", {
            language: targetName,
            tag: targetLanguageTag,
          })}
        </span>
        <Popover>
          <PopoverTrigger
            className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded text-amber-900 hover:bg-amber-200 dark:text-amber-200 dark:hover:bg-amber-800/40"
            aria-label={t("marketplaceLanguage.detailsAriaLabel")}
          >
            <Info className="h-3 w-3" aria-hidden />
          </PopoverTrigger>
          <PopoverContent className="w-80 text-[11px] leading-relaxed" side="top" align="end">
            <p className="font-medium text-foreground">{t("marketplaceLanguage.popoverTitle")}</p>
            <p className="mt-1 text-muted-foreground">
              {t("marketplaceLanguage.popoverBody", {
                sourceLanguage: sourceName,
                targetLanguage: targetName,
                fieldLabel,
              })}
            </p>
            {sourceValue ? (
              <div className="mt-2 rounded border border-border/60 bg-muted/60 p-2">
                <p className="mb-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                  {t("marketplaceLanguage.sourceValueLabel")}
                </p>
                <p className="line-clamp-4 text-foreground">{sourceValue}</p>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
      {!manualMode ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-5 gap-1 bg-amber-600 px-2 text-[9px] font-semibold text-white shadow-sm hover:bg-amber-700 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
            onClick={handleTranslate}
          >
            <Languages className="h-3 w-3" aria-hidden />
            {t("marketplaceLanguage.translateWithAi")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-5 border-amber-500/60 bg-transparent px-2 text-[9px] font-semibold text-amber-900 hover:bg-amber-200 dark:border-amber-400/60 dark:text-amber-100 dark:hover:bg-amber-800/40"
            onClick={handleManual}
          >
            {t("marketplaceLanguage.manualEnter")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
