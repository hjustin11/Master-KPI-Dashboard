/**
 * Spaltenüberschrift: nur der erste Buchstabe groß, der Rest klein
 * (z. B. „EBAY“ → „Ebay“, „SHOPIFY STANDARD“ → „Shopify standard“).
 * Nur für Anzeige — Daten-Schlüssel unverändert lassen.
 */
export function sentenceCaseColumnLabel(input: string): string {
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
