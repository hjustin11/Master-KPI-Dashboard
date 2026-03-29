/** Reihenfolge der Kacheln auf Einstellungen → Benutzer (Bearbeiten-Modus). */
export const DEFAULT_SETTINGS_USERS_SECTION_ORDER = [
  "roles-manage",
  "invite",
  "members",
  "permissions",
  "sidebar-visibility",
] as const;

export type SettingsUsersSectionId = (typeof DEFAULT_SETTINGS_USERS_SECTION_ORDER)[number];

export function isValidSettingsUsersSectionOrder(
  value: unknown
): value is SettingsUsersSectionId[] {
  if (!Array.isArray(value) || value.length !== DEFAULT_SETTINGS_USERS_SECTION_ORDER.length) {
    return false;
  }
  const allowed = new Set<string>(DEFAULT_SETTINGS_USERS_SECTION_ORDER);
  return value.every((item) => typeof item === "string" && allowed.has(item));
}

export function normalizeSettingsUsersSectionOrder(
  value: unknown
): SettingsUsersSectionId[] {
  if (!isValidSettingsUsersSectionOrder(value)) {
    return [...DEFAULT_SETTINGS_USERS_SECTION_ORDER];
  }
  return [...value];
}
