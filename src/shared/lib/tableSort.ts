/**
 * Locale-Vergleich für Tabellensortierung: leere Strings gelten als „größer“,
 * stehen bei aufsteigender Sortierung unten (z. B. „ohne Tag“ zuletzt).
 */
export function compareLocaleStringEmptyLast(a: string, b: string): number {
  const emptyA = !a;
  const emptyB = !b;
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}
