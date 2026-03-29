import { de, enUS, zhCN } from "date-fns/locale";
import type { Locale } from "@/i18n/config";

export function getDateFnsLocale(appLocale: Locale) {
  if (appLocale === "zh") return zhCN;
  if (appLocale === "en") return enUS;
  return de;
}

/** Für `Intl.NumberFormat`, `Intl.DateTimeFormat`, … */
export function intlLocaleTag(appLocale: Locale): string {
  if (appLocale === "zh") return "zh-CN";
  if (appLocale === "en") return "en-US";
  return "de-DE";
}
