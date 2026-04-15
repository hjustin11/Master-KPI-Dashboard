/**
 * System- und User-Prompt-Builder für die Amazon-Content-Optimierung.
 * Kombiniert hinterlegtes Regelwerk (amazon_haustierbedarf_regelwerk.md)
 * mit aktuellen 2026 Listing-Best-Practices (A9/A10, mobile-first, strikte Feld-Limits).
 *
 * Nutzung: Von amazonContentLlmClaude.ts (und künftig anderen Providern) geteilt.
 */

import type { AmazonTitleProductContext } from "@/shared/lib/amazonTitleOptimizationContext";

/**
 * Festes Domain-Wissen zu Amazon.de Haustierbedarf-Listings (Stand 2026).
 * Ergänzt das Regelwerk-Markdown um Punkte, die nicht im 2017er Style Guide stehen
 * (mobile Darstellung, A9/A10-Ranking, Backend-Byte-Limits, Conversion-Copywriting).
 */
const AMAZON_2026_KNOWLEDGE = `
## Amazon.de Haustierbedarf — Listing Best Practices (2026)

### Titel
- **Hartes 80-Zeichen-Limit** für Pet Supplies (strenger als Standard 200).
- Mobile Suchergebnisse zeigen nur 70–80 Zeichen → Kernkeyword MUSS in den ersten 70 Zeichen.
- Format: [Marke] [Produkttyp] [Kernmerkmal] [Variante] [Menge/Größe]
- Verbotene Zeichen: !, ?, *, €, ®, ©, ™, {, }, ^
- Verbotene Begriffe: Sonderangebot, Bestseller, gratis, Prime, Sale, Rabatt, Versandkostenfrei, Neu, 100%
- Keine HTML-Tags. Zahlen als Ziffern (nicht "fünf" → "5"). Einheiten mit Leerzeichen: "500 ml", "3,6 kg".

### Bullet Points (5 Stück)
- Struktur: BENEFIT-HEADLINE (CAPS, max. 3–4 Wörter) — Feature → Proof
- Max. 200–250 Zeichen je Bullet (Pet Supplies: 200 sicher).
- Erste 70–80 Zeichen mobile-kritisch: Kernnutzen muss vorne stehen.
- Bullet 1 = Hauptnutzen/Kernmerkmal (bei Tierfutter: Zielgruppe + Hauptzutat; bei Spielzeug: Entwicklungsvorteil; bei Zubehör: Kernfunktion).
- Bei Mehrfachpackungen: Bullet 1 = Inhalts-Aufschlüsselung (z. B. "10 × 100 g Nassfutter, 3 Sorten").
- Keine Preise, keine Versandinfos, keine Werbebegriffe, keine Händlerinfos.
- Relevante Suchbegriffe natürlich einbauen, nicht stopfen.

### Beschreibung
- Fließtext (keine Stichpunkte, keine HTML), mind. 150, max. ~2000 Zeichen.
- Alleinstellungsmerkmale (USP), Anwendung, Zielgruppe, Nutzen aus Kundensicht.
- Keine Preise, Versand-, Händler-, Garantie-, Rückgabe-Infos.
- Subtile Storytelling-Elemente erlaubt, aber faktisch korrekt.

### Backend-Suchbegriffe (search-terms)
- Hartes **249-Byte-Limit** (ASCII). Umlaute (ä, ö, ü, ß) zählen als 2 Bytes → effektiv ~200 Zeichen bei DE.
- Überschreiten um EIN Byte = Amazon ignoriert das komplette Feld.
- Nur Begriffe, die **NICHT bereits** im Titel oder in den Bullet Points vorkommen.
- Keine Marke, kein ASIN, keine generischen Begriffe wie "Hund", "Katze", "Tier".
- Synonyme, alternative Bezeichnungen, typische Long-Tail-Suchen, häufige Tippfehler nutzen.
- Komma-separiert, keine doppelten Worte.

### A9/A10 Ranking-Relevanz
- Amazon bewertet Listings nach **Relevanz × Performance**.
- Relevanz = Keyword-Matching in Title (höchstes Gewicht), Bullets, Beschreibung, Backend.
- Performance = Conversion Rate, Sales Velocity, Review-Score.
- Keyword-Duplikate zwischen Title/Bullets/SearchTerms verschwenden Indexierungsplatz — jedes indexierte Keyword sollte nur EINMAL genutzt werden.
- Mobile-First: 60–80 % des Traffics ist mobil → Kernbotschaft in den ersten Zeichen jedes Feldes.

### Produkttyp & Attribute (technische Felder)
- Amazon-Produkttyp-Code muss zur Kategorie passen (z. B. PET_FOOD, DOG_TOY, CAT_LITTER).
- Pflicht-Attribute der Kategorie müssen befüllt sein: Farbe, Material, Zielgruppe (Tierart), Lebensphase, Packungsgröße, Geschmacksrichtung.
- Paketmaße in cm, Gewicht in kg — plausibel zu physischem Produkt.

### Regelwerk-Referenzen
Wenn das Regelwerk unten Regel-IDs im Format "TITEL-001", "BULLET-003" usw. enthält,
ZITIERE diese IDs in den \`ruleIds\`-Feldern und \`issues\`, damit der User die Quelle nachvollziehen kann.
`;

/**
 * Baut den kompletten System-Prompt.
 * Ergänzt 2026-Domain-Wissen um das vollständige Regelwerk (gekürzt auf maxRulebookChars).
 */
export function buildAmazonContentSystemPrompt(
  rulebookMarkdown: string,
  maxRulebookChars = 24000
): string {
  const rulebook = rulebookMarkdown.trim();
  const rulebookSection = rulebook
    ? `\n\n---\n\n## Hinterlegtes Regelwerk (amazon_haustierbedarf_regelwerk.md)\n\nDieses Regelwerk ist die PRIMÄRE Quelle und muss IMMER beachtet werden.\nBei Konflikten mit den 2026-Best-Practices oben gilt das Regelwerk, außer es widerspricht aktuellen Amazon-Richtlinien eindeutig.\n\n${rulebook.slice(0, maxRulebookChars)}`
    : "\n\n(Kein Regelwerk-Text geladen — nutze nur die 2026-Best-Practices oben.)";

  return [
    "Du bist ein erfahrener Amazon-Listing-Experte für die Kategorie **Haustierbedarf auf Amazon.de**.",
    "Deine Aufgabe: Ein existierendes Produkt-Listing analysieren und Feld für Feld optimieren.",
    "",
    "## Grundregeln",
    "1. Antworte IMMER durch Aufruf des Tools `optimize_amazon_listing` — niemals freier Text.",
    "2. Basiere alle Vorschläge ausschließlich auf Fakten aus dem JSON-Kontext (Produktdaten) und dem Regelwerk. Erfinde keine Gewichte, Größen, Zutaten oder Herstellerangaben.",
    "3. Für jedes Feld: Wenn der aktuelle Wert bereits regelkonform und optimal ist, setze `improved: null` und einen kurzen `reason`.",
    "4. Alle verbesserten Texte in **deutscher Sprache**, Marketplace ist Amazon.de.",
    "5. Scores: 100 = perfekt; 80–99 = gut mit kleinen Optimierungen; 50–79 = mittelmäßig; <50 = Regelverstöße oder kritische Mängel.",
    "6. `ruleIds`: Wenn das Regelwerk (Markdown unten) konkrete Regel-IDs enthält (z. B. `TITEL-003`, `BULLET-005`), referenziere sie im `ruleIds`-Array des jeweiligen Feldes und in `issues[].ruleId`.",
    "",
    AMAZON_2026_KNOWLEDGE,
    rulebookSection,
  ].join("\n");
}

/**
 * Baut den User-Message-Inhalt mit allen relevanten Produktdaten.
 */
export function buildAmazonContentUserPayload(ctx: AmazonTitleProductContext): string {
  const payload = {
    instruction:
      "Analysiere dieses Amazon-Listing und schlage für JEDES Feld mit Verbesserungspotenzial einen optimierten Wert vor. Beachte das hinterlegte Regelwerk (primär) und die 2026-Best-Practices.",
    productContext: {
      sku: ctx.sku,
      asin: ctx.asin,
      currentAmazonTitle: ctx.currentAmazonTitle,
      brand: ctx.brand,
      productType: ctx.productType,
      conditionType: ctx.conditionType,
      bulletPoints: ctx.bulletPoints,
      description: ctx.descriptionExcerpt,
      attributes: ctx.attributes,
      externalProductId: ctx.externalProductId,
      externalProductIdType: ctx.externalProductIdType,
      shopifyReference: ctx.shopify
        ? {
            title: ctx.shopify.title,
            descriptionExcerpt: ctx.shopify.descriptionExcerpt,
            tags: ctx.shopify.tags,
            vendor: ctx.shopify.vendor,
            productType: ctx.shopify.productType,
          }
        : null,
    },
  };
  return JSON.stringify(payload);
}
