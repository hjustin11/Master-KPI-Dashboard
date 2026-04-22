/**
 * MediaMarkt/Saturn Mirakl Kategorien.
 *
 * **Format**: Kategorie-Pfad-String — z. B. `"PET CARE / PET WELFARE / HYGIENE"`
 * oder `"Handelsware|Katzentoilette"`. Die `FET_FRA_NNNN`-Codes, die in
 * bestehenden Offers auftauchen, sind INTERNE IDs von MMS — sie werden
 * beim PM01-Upload NICHT als `category`-Value akzeptiert.
 *
 * Beweis: MMS liefert XML-Templates (siehe content/marketplace_guidelines/
 * mediamarkt-saturn.md) mit `<attribute><code>category</code><value>PET CARE
 * / PET WELFARE / HYGIENE</value></attribute>`.
 *
 * Discovery-Quelle: MMS-Seller-Backoffice → Katalog → Produkt-anlegen →
 * Kategorie-Auswahl zeigt die Pfad-Strings.
 *
 * Stand 2026-04-21.
 */

export type MediaMarktCategory = {
  /** Kategorie-Pfad wie im PM01-Upload erwartet. */
  path: string;
  /** Kurzer, menschen­lesbarer Name. */
  label: string;
  /** Interner MMS-Code (aus Offer-API) — nur zur Referenz. */
  internalCode?: string;
};

/**
 * Bekannte PET-CARE-Pfade — NUR Pfade, die durch XML-Templates ODER existierende
 * Offers empirisch bestätigt sind. Frühere vermutete Pfade (KRATZMOEBEL,
 * SPIELZEUG, SCHLAFPLATZ) wurden entfernt, weil MMS sie mit Error 1001
 * ("category is unknown") ablehnt. Für Kratzmöbel/Spielzeug/Schlafplatz muss
 * der korrekte Pfad manuell im MMS-Seller-Backoffice unter
 * Katalog > Produkt anlegen > Kategorie-Auswahl nachgeschlagen und hier
 * ergänzt werden.
 */
export const MMS_CATEGORIES: readonly MediaMarktCategory[] = [
  { path: "PET CARE / PET WELFARE / HYGIENE", label: "HAUSTIER HYGIENE", internalCode: "FET_FRA_1658" },
  { path: "PET CARE / PET WELFARE / PFLEGE", label: "HAUSTIER PFLEGE", internalCode: "FET_FRA_1659" },
  { path: "PET CARE / PET WELFARE / TRAENKE & NAEPFE", label: "HAUSTIER TRAENKE & NAEPFE", internalCode: "FET_FRA_1655" },
  { path: "Handelsware|Katzentoilette", label: "Katzentoilette (Handelsware)" },
];

/**
 * Heuristisches Mapping aus deutschen Rohlabels auf **bestätigte** MMS-Pfade.
 * Für Kategorien ohne bestätigten Pfad (Kratzmöbel, Spielzeug, Schlafplatz)
 * gibt es hier bewusst kein Pattern — der Resolver liefert `null` und die
 * Pre-Flight-Validation stoppt mit einer Handlungsanweisung.
 */
const LABEL_HINTS: Array<{ pattern: RegExp; path: string }> = [
  // Toilette & Hygiene
  { pattern: /katzentoil|katzenklo|litter.?box|katzen.?klo|kotbeutel|streumatte|m(ü|ue)llbeutel|katzenstreumatte|lufterfrischer|hygien|reinig|desodor|geruchsneutra/i, path: "PET CARE / PET WELFARE / HYGIENE" },
  // Trinken & Füttern
  { pattern: /napf|bowl|feeding|tr(ä|ae)nk|trinkbr|futterautomat|futterspender|wasser.?sp|vakuumbeh/i, path: "PET CARE / PET WELFARE / TRAENKE & NAEPFE" },
  // Pflege (Fellpflege, Bürsten, Sauger, Filter)
  { pattern: /b(ü|ue)rste|brush|haarb(ü|ue)rste|pflege.?masch|fellpflege|hepa|filter|pflege|grooming|schermaschine/i, path: "PET CARE / PET WELFARE / PFLEGE" },
];

/**
 * Prüft, ob ein String plausibel ein MMS-Kategorie-Pfad ist (enthält `/` oder `|`).
 */
function looksLikeMmsPath(s: string): boolean {
  return /\//.test(s) || /\|/.test(s);
}

/**
 * Mappt eine User-Eingabe (Pfad, Label oder deutsches Rohwort) auf einen
 * MMS-Mirakl-Category-Pfad. Gibt null zurück wenn nichts passt.
 */
export function resolveMediaMarktCategoryCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // 1) Ist bereits ein Pfad (Slash- oder Pipe-getrennt)?
  if (looksLikeMmsPath(trimmed)) {
    // Normalisieren: doppelte Leerzeichen, Spaces um `/` konsistent
    return trimmed.replace(/\s*\/\s*/g, " / ").replace(/\s{2,}/g, " ").trim();
  }
  // 2) Interner MMS-Code (FET_FRA_NNNN)? Versuche auf bekannten Pfad zu
  //    mappen, damit PM01 den Pfad bekommt (nicht den Code).
  if (/^FET_FRA_\d+$/i.test(trimmed)) {
    const hit = MMS_CATEGORIES.find((c) => c.internalCode === trimmed.toUpperCase());
    if (hit) return hit.path;
    return null;
  }
  // 3) Exaktes Label (z. B. "HAUSTIER HYGIENE")?
  const byLabel = MMS_CATEGORIES.find(
    (c) => c.label.toLowerCase() === trimmed.toLowerCase()
  );
  if (byLabel) return byLabel.path;
  // 4) Heuristik für deutsche Rohlabels
  for (const hint of LABEL_HINTS) {
    if (hint.pattern.test(trimmed)) return hint.path;
  }
  return null;
}

export function mediaMarktCategoryLabel(path: string): string {
  const hit = MMS_CATEGORIES.find((c) => c.path === path);
  return hit ? `${path} — ${hit.label}` : path;
}
