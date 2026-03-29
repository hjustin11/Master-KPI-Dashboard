import type { Locale } from "@/i18n/config";
import de from "@/i18n/messages/de.json";
import en from "@/i18n/messages/en.json";
import zh from "@/i18n/messages/zh.json";

const dictionaries: Record<Locale, Record<string, unknown>> = {
  de: de as Record<string, unknown>,
  en: en as Record<string, unknown>,
  zh: zh as Record<string, unknown>,
};

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function translate(locale: Locale, key: string): string {
  const primary = getByPath(dictionaries[locale], key);
  if (typeof primary === "string" && primary.length > 0) return primary;
  if (locale !== "de") {
    const fallback = getByPath(dictionaries.de, key);
    if (typeof fallback === "string" && fallback.length > 0) return fallback;
  }
  return key;
}

/** Platzhalter: t('greeting', { name: 'Ada' }) */
export function translateParams(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  let s = translate(locale, key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
