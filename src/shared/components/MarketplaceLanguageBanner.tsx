"use client";

import { getAmazonMarketplaceBySlug } from "@/shared/config/amazonMarketplaces";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";

export type MarketplaceLanguageBannerProps = {
  /** Dashboard-Slug wie "amazon-de", "amazon-fr". */
  marketplaceSlug: string;
  variant?: "compact" | "default";
  className?: string;
};

export function languageDisplayName(
  tag: string,
  t: (key: string) => string
): string {
  const key = `marketplaceLanguage.lang_${tag}`;
  const translated = t(key);
  // Wenn der Key nicht existiert, liefert das i18n-Framework meist den Key selbst zurück.
  return translated && translated !== key ? translated : tag;
}

export function MarketplaceLanguageBanner({
  marketplaceSlug,
  variant = "default",
  className,
}: MarketplaceLanguageBannerProps) {
  const { t } = useTranslation();
  const config = getAmazonMarketplaceBySlug(marketplaceSlug);
  if (!config) return null;

  const languageName = languageDisplayName(config.languageTag, t);
  const isCompact = variant === "compact";

  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-muted/40 text-muted-foreground",
        isCompact ? "px-3 py-1.5 text-[10px]" : "px-4 py-2.5 text-xs",
        className
      )}
      data-testid="marketplace-language-banner"
    >
      <div className={cn("flex flex-wrap items-center gap-2", isCompact ? "gap-1.5" : "gap-2")}>
        <span className={cn(isCompact ? "text-base leading-none" : "text-lg leading-none")} aria-hidden>
          {config.countryFlag}
        </span>
        <span className="font-semibold text-foreground">{config.name}</span>
        <span>
          —{" "}
          {t("marketplaceLanguage.contentIn", { language: languageName })}
        </span>
        <span className="rounded border border-border/50 bg-background/60 px-1.5 py-0.5 font-mono text-[9px]">
          {config.languageTag}
        </span>
      </div>
      {!isCompact ? (
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/80">
          <span>
            {t("marketplaceLanguage.marketplaceId")}:{" "}
            <span className="font-mono">{config.marketplaceId}</span>
          </span>
          <span>
            {t("marketplaceLanguage.changesOnlyApplyTo", { name: config.shortName })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
