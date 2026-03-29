"use client";

import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LOCALES, type Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/I18nProvider";

const FLAG: Record<Locale, string> = {
  de: "🇩🇪",
  en: "🇬🇧",
  zh: "🇨🇳",
};

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        nativeButton
        className={cn(
          "inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-lg transition-colors",
          "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        )}
        aria-label={t("language.switch")}
        title={t("language.switch")}
      >
        <span className="leading-none" aria-hidden>
          {FLAG[locale]}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {LOCALES.map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => setLocale(code)}
            className="flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <span className="text-base" aria-hidden>
                {FLAG[code]}
              </span>
              <span>{t(`language.${code}`)}</span>
            </span>
            {locale === code ? <Check className="h-4 w-4 shrink-0 opacity-70" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
