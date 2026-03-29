import type { Locale } from "@/i18n/config";
import { translate } from "@/i18n/translate";

/** Anzeigename: manueller Override aus dem Store, sonst Übersetzung `roles.<key>`. */
export function resolveRoleLabel(
  roleKey: string,
  override: string | undefined,
  locale: Locale
): string {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;
  const key = `roles.${roleKey}`;
  const tr = translate(locale, key);
  return tr === key ? roleKey : tr;
}
