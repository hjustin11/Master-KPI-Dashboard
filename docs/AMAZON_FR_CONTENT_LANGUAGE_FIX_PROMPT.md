# Claude Code Prompt: Amazon Multi-Country Content-Loading Fix

```
Lies zuerst:
1. src/shared/lib/amazonProductsSpApiCatalog.ts (spApiRequest, getListingItem)
2. src/shared/lib/amazonListingsItemsPut.ts (PUT-Request für Updates)
3. src/shared/lib/crossListing/amazonListingPayload.ts (Payload-Builder)
4. src/shared/config/amazonMarketplaces.ts (Multi-Country-Config)
5. Die Artikel-Editor-Komponente (wahrscheinlich AmazonProductEditor.tsx 
   oder Cross-Listing Dialog)
6. src/shared/lib/crossListing/mergeCrossListingSources.ts (Merge-Logic)

## KONTEXT — Das aktuelle Problem

Der Amazon-FR-Marktplatz ist bereits im Dashboard verfügbar 
(Sidebar-Eintrag, französische Listings werden geladen).

Beim Öffnen eines Artikels im Edit-Dialog:
- ✅ Titel wird auf Französisch geladen
- ❌ Beschreibung wird auf Deutsch geladen
- ❌ Bullet Points werden auf Deutsch geladen
- ❌ Andere Content-Felder kommen in deutscher Sprache

Das bedeutet: Beim SPEICHERN/UPDATEN würde der deutsche Content auf 
Amazon FR geschrieben werden — das lehnt Amazon ab oder überschreibt 
französische Inhalte mit deutschen. Für den User wäre das fatal.

## DIE WURZELURSACHE

Amazon speichert Content-Felder pro Sprache. Die API-Keys enthalten 
den `language_tag` im Attribut-Namen:

```
item_name[marketplace_id=A1PA6795UKMFR9][language_tag=de_DE]#1.value
item_name[marketplace_id=A13V1IB3VIYZZH][language_tag=fr_FR]#1.value
```

Beim GET-Request gibt Amazon ALLE Sprachversionen zurück (wenn gepflegt).
Der Merge-Layer scheint aber für einige Felder die deutsche Version 
zu bevorzugen — wahrscheinlich weil:

a) Die GET-Response-Parsing-Logik nicht den language_tag filtert
b) Fallback auf de_DE wenn fr_FR nicht gepflegt ist (und die deutsche 
   Version als "besser als nichts" angezeigt wird)
c) Das Merge über mehrere Quellen (Xentral/Amazon/Shopify) den 
   Xentral-deutschen-Wert drüberlegt

Für den Titel funktioniert es vermutlich weil der explizit gepflegt 
ist oder weil der Merge hier korrekt läuft — aber für die anderen 
Felder läuft es schief.

## AUFGABE — STRUKTURIERTER FIX

### TEIL 1 — DIAGNOSE (zuerst!)

KEINE Fixes bevor die Diagnose steht.

SCHRITT 1.1 — Logging einbauen:

Füge in `amazonProductsSpApiCatalog.ts` (oder wo die GET-Response 
vom Amazon-Listing-API geparst wird) folgendes Logging ein:

```typescript
console.log('[amazon:listing-get]', {
  sku,
  marketplaceId,
  languageTag,
  rawAttributesKeys: Object.keys(response.attributes ?? {}),
  itemNameEntries: response.attributes?.item_name,
  productDescriptionEntries: response.attributes?.product_description,
  bulletPointEntries: response.attributes?.bullet_point,
});
```

SCHRITT 1.2 — Test-Call machen:

Öffne im Dashboard einen Artikel auf Amazon FR im Edit-Dialog.
Zeig mir das Log-Output vollständig.

Aus dem Log müssen folgende Fragen beantwortbar sein:

a) Welche language_tags liefert Amazon zurück für diesen Artikel?
   (z.B. nur de_DE? nur fr_FR? beide? andere?)

b) Sind für Titel UND Beschreibung beide Sprachen vorhanden?
   Oder ist bei Beschreibung nur de_DE da?

c) Welches Attribut-Key-Format liefert Amazon genau?
   z.B.: "product_description[language_tag=fr_FR]#1.value"
   oder mit marketplace_id Prefix?

SCHRITT 1.3 — Merge-Logic prüfen:

Lies mergeCrossListingSources.ts und finde heraus:

a) Wie werden die Amazon-Attribute in das einheitliche Editor-Modell 
   überführt?

b) Gibt es eine Stelle wo Xentral-Content ODER eine andere Quelle 
   den Amazon-Content überschreibt?

c) Wird beim Mapping der language_tag berücksichtigt oder wird 
   der erste gefundene Wert genommen?

SCHRITT 1.4 — Report an User:

Bevor du irgendwas fixt, schreib mir in einem Report:

```
DIAGNOSE-REPORT:

1. Welche language_tags kommen vom Amazon-GET zurück?
   → [deine Antwort]

2. Ist der Bug im Response-Parsing oder im Merge-Layer?
   → [deine Antwort]

3. Wird beim Update (PUT) der richtige language_tag pro Feld gesetzt?
   → [deine Antwort basierend auf Code-Analyse]

4. Dein Fix-Plan in 3-5 Punkten:
   → [dein Plan]
```

### TEIL 2 — FIX (nach User-Freigabe der Diagnose)

Der Fix muss vier Ebenen abdecken:

#### Ebene A — GET: Richtige Sprache laden

In amazonProductsSpApiCatalog.ts (oder wo GET /listings/items aufgerufen 
wird):

```typescript
export async function getAmazonListing(
  sku: string,
  marketplaceSlug: string  // z.B. "amazon-fr"
): Promise<AmazonListingData> {
  const config = getAmazonMarketplace(marketplaceSlug);
  if (!config) throw new Error(`Unknown marketplace: ${marketplaceSlug}`);
  
  const response = await spApiRequest(
    `/listings/2021-08-01/items/${sellerId}/${sku}` +
    `?marketplaceIds=${config.marketplaceId}` +
    `&includedData=summaries,attributes,issues,offers` +
    `&issueLocale=${config.languageTag}`,
    { marketplaceId: config.marketplaceId }
  );
  
  // KRITISCH: Beim Parsen der Attribute: Filtere nach language_tag
  return parseAmazonAttributes(response.attributes, config.languageTag);
}

function parseAmazonAttributes(
  rawAttributes: Record<string, any[]>,
  targetLanguageTag: string
): AmazonListingData {
  const result: AmazonListingData = {};
  
  // Für jedes bekannte Content-Feld:
  // 1. Prüfe ob es Einträge mit dem gewünschten language_tag gibt
  // 2. Wenn ja: nimm nur diese
  // 3. Wenn nein: zeige Feld als LEER (nicht deutsch als Fallback!)
  
  const contentFields = [
    'item_name',
    'product_description',
    'bullet_point',
    'generic_keyword',
    'model_name',
    'brand',
    'manufacturer',
    'included_components',
    'directions',
  ];
  
  for (const fieldKey of contentFields) {
    const entries = rawAttributes[fieldKey];
    if (!entries) continue;
    
    // Filter nach language_tag
    const matchingEntries = entries.filter((entry: any) => 
      entry.language_tag === targetLanguageTag
    );
    
    if (matchingEntries.length > 0) {
      result[fieldKey] = matchingEntries;
    } else {
      // WICHTIG: Kein Fallback auf andere Sprache!
      // Lieber leeres Feld zeigen damit User weiß: 
      // "Noch nicht auf Französisch gepflegt"
      result[fieldKey] = [];
      result[`${fieldKey}_missing_translation`] = true;
    }
  }
  
  return result;
}
```

#### Ebene B — MERGE: Xentral-Deutsch nicht über Amazon-FR legen

In mergeCrossListingSources.ts:

Der Merge darf für den FR-Markt NICHT den Xentral-deutschen-Content 
als Quelle nutzen. Entweder:

Option 1: Xentral wird generell als Quelle bevorzugt, aber für 
Content-Felder (Titel, Beschreibung, Bullets) nur wenn die Zielsprache 
zur Xentral-Sprache passt.

```typescript
function pickContentValue(
  sources: { xentral?: string; amazon?: string; shopify?: string },
  targetLanguageTag: string,
  xentralLanguageTag: string = "de_DE"  // Xentral ist auf Deutsch
): string | undefined {
  // Wenn Ziel = Xentral-Sprache (de_DE): alle Quellen OK
  if (targetLanguageTag === xentralLanguageTag) {
    return sources.xentral ?? sources.amazon ?? sources.shopify;
  }
  
  // Wenn Ziel eine andere Sprache: NUR Amazon (bereits übersetzt) 
  // oder Shopify wenn lokalisiert
  return sources.amazon ?? sources.shopify;
}
```

Option 2 (besser): Der Merge unterscheidet "Stammdaten" (Marke, EAN, 
Bilder, Preis, Bestand — sprachunabhängig) von "Content" (Titel, 
Beschreibung, Bullets — sprachabhängig).

- Stammdaten: Merge wie gehabt (Xentral > Amazon > Shopify)
- Content: NUR aus der Quelle die die richtige Sprache hat

Implementiere das sauber mit einem Feld-Typ-Marker:

```typescript
type FieldLocalization = "shared" | "localized";

const FIELD_TYPES: Record<string, FieldLocalization> = {
  sku: "shared",
  ean: "shared",
  brand: "localized",  // Amazon erwartet brand pro Sprache
  price: "shared",
  stock: "shared",
  images: "shared",
  item_name: "localized",
  product_description: "localized",
  bullet_point: "localized",
  // ...
};
```

#### Ebene C — UI: Sprache anzeigen

Im Editor-Dialog: Füge oben eine klare Sprach-Info ein:

```
┌─────────────────────────────────────────────────────────┐
│ 🇫🇷 Amazon Frankreich — Content auf Französisch          │
│                                                         │
│ Master-Quelle: Amazon DE (deutsch)                      │
│ [🔄 Von DE übersetzen]  [📝 Manuell bearbeiten]         │
└─────────────────────────────────────────────────────────┘
```

Bei Feldern die NICHT auf Französisch gepflegt sind:

```
Beschreibung *                                           
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Keine französische Version vorhanden                 │
│                                                         │
│ Auf Amazon DE gepflegt:                                 │
│ "Diese Müllbeutel sind perfekt für..."                  │
│                                                         │
│ [🤖 Mit KI übersetzen]  [Leer lassen]                   │
└─────────────────────────────────────────────────────────┘
```

Das Feld ist leer (kein deutscher Content eingefügt) — User sieht 
klar: "Hier fehlt die französische Version". Button bietet KI-
Übersetzung an.

#### Ebene D — PUT: Richtige Sprach-Keys beim Update

In amazonListingPayload.ts:

Beim Aufbau des PUT-Payloads muss language_tag dynamisch gesetzt 
werden BASIEREND auf dem Ziel-Marktplatz, nicht hardcoded:

```typescript
export function buildAmazonListingPayload(
  values: ListingValues,
  marketplaceSlug: string
): AmazonPayload {
  const config = getAmazonMarketplace(marketplaceSlug);
  if (!config) throw new Error(`Unknown marketplace: ${marketplaceSlug}`);
  
  const { marketplaceId, languageTag } = config;
  
  return {
    productType: values.productType,
    attributes: {
      item_name: [{
        marketplace_id: marketplaceId,
        language_tag: languageTag,  // dynamisch
        value: values.title,
      }],
      product_description: [{
        marketplace_id: marketplaceId,
        language_tag: languageTag,
        value: values.description,
      }],
      bullet_point: values.bulletPoints.map(bp => ({
        marketplace_id: marketplaceId,
        language_tag: languageTag,
        value: bp,
      })),
      brand: [{
        marketplace_id: marketplaceId,
        language_tag: languageTag,
        value: values.brand,
      }],
      // ... alle localized Felder
      
      // Shared Felder (ohne language_tag):
      supplier_declared_dg_hz_regulation: [{
        marketplace_id: marketplaceId,
        value: values.dgRegulation,
      }],
      batteries_required: [{
        marketplace_id: marketplaceId,
        value: values.batteriesRequired,
      }],
      // ...
    }
  };
}
```

Suche alle Stellen wo `language_tag=de_DE` hardcoded steht und 
ersetze sie durch den dynamischen Wert aus der Marketplace-Config.

### TEIL 3 — KI-ÜBERSETZUNGS-FEATURE

Wenn der User einen Artikel zum ersten Mal auf Amazon FR pflegt und 
noch kein französischer Content existiert: Biete automatische 
Übersetzung vom Master (meist Deutsch) an.

Nutze den bestehenden crossListingLlmOptimize.ts — erweitere ihn 
um einen "translation"-Modus:

```typescript
export async function translateListingContent(
  sourceContent: { title: string; description: string; bullets: string[] },
  sourceLanguageTag: string,  // z.B. "de_DE"
  targetLanguageTag: string,  // z.B. "fr_FR"
  productContext: { brand: string; category: string; productType: string }
): Promise<{ title: string; description: string; bullets: string[] }> {
  // Nutze Claude Sonnet 4 oder OpenAI
  // Prompt: "Übersetze diesen Amazon-Listing-Content von {source} nach {target}.
  //          Behalte Keywords bei. Passe idiomatische Wendungen an die 
  //          Ziel-Kultur an. Produktkontext: {context}."
  // Output-Schema: JSON mit title, description, bullets
}
```

UI-Flow:
1. User öffnet Amazon FR Listing, Content ist leer
2. Button "🤖 Mit KI aus DE übersetzen" klicken
3. Loader zeigt "Übersetze..."
4. Felder werden gefüllt mit französischer Übersetzung
5. User kann anpassen und speichert
6. PUT sendet französischen Content mit language_tag=fr_FR

### TEIL 4 — PREVIEW VOR DEM SPEICHERN

Ganz wichtig: Bevor der User auf "Speichern" klickt, Preview zeigen:

```
┌─────────────────────────────────────────────────────────┐
│ Änderungen vor dem Upload zu Amazon FR                  │
│                                                         │
│ Sprache: Französisch (fr_FR)                            │
│ Marktplatz: Amazon.fr (A13V1IB3VIYZZH)                  │
│                                                         │
│ Geänderte Felder:                                       │
│   • item_name: "AstroPet Katzentoilettenbeutel..."      │
│     → "AstroPet Sacs à litière pour chats..."           │
│   • product_description: [3 Absätze]                    │
│   • bullet_point: 5 Einträge                            │
│                                                         │
│ ⚠️ Der deutsche Content auf Amazon DE wird NICHT        │
│    geändert.                                            │
│                                                         │
│ [Abbrechen]   [Änderungen speichern]                    │
└─────────────────────────────────────────────────────────┘
```

Das verhindert dass User versehentlich den falschen Sprach-Content 
auf den falschen Markt pushen.

## UMSETZUNGSREIHENFOLGE

PHASE 1 — DIAGNOSE:
1. Logging in GET-Response
2. Test-Call im Dashboard
3. Report an User mit 4 Antworten + Fix-Plan
4. STOPP — auf User-Freigabe warten

PHASE 2 — GET-Fix:
5. parseAmazonAttributes mit language_tag-Filter
6. Leere Felder statt deutsches Fallback
7. Flag "_missing_translation" setzen
8. Test: FR-Artikel öffnen, nur FR-Content wird geladen

PHASE 3 — MERGE-Fix:
9. FIELD_TYPES-Tabelle (shared vs localized)
10. Merge-Logic: Content nur aus passender Sprach-Quelle
11. Test: Xentral-Deutsch erscheint NICHT mehr bei FR-Listing

PHASE 4 — PUT-Fix:
12. language_tag dynamisch im Payload-Builder
13. Shared vs localized Felder sauber trennen
14. Test: Update von FR-Artikel speichert mit language_tag=fr_FR

PHASE 5 — UI + Übersetzung:
15. Sprach-Info-Banner im Dialog
16. "Missing translation"-Hinweise pro Feld
17. KI-Übersetzung-Button
18. Preview-Dialog vor Upload

PHASE 6 — Tests:
19. amazonListingParse.test.ts — Sprach-Filter korrekt
20. amazonListingPayload.test.ts — dynamischer language_tag
21. translation.test.ts — KI-Übersetzung funktioniert

## CONSTRAINTS

- KEIN Fallback von fr_FR auf de_DE bei leeren Feldern 
  (lieber UI-Hinweis)
- PUT-Payload darf NIEMALS gemischte Sprachen enthalten
- Xentral-Stammdaten (EAN, SKU, Bilder, Preis) sind sprachunabhängig 
  und werden weiter gemergt
- Bei Artikel der auf DE UND FR existiert: Dialog zeigt nur die 
  Sprache des aktuell gewählten Marktplatzes
- KI-Übersetzung darf nicht automatisch laufen — nur auf User-Klick
- Preview-Dialog IMMER vor PUT zeigen (auch bei kleinen Änderungen)

## ZEIGE MIR ZUERST DIAGNOSE

Führe PHASE 1 durch und schick mir den Report:

```
DIAGNOSE-REPORT für Amazon FR Content-Loading

1. language_tags in der GET-Response:
   [Antwort]

2. Bug-Lokalisierung:
   [Antwort]

3. PUT-language_tag-Handling aktuell:
   [Antwort]

4. Fix-Plan:
   [5-Punkte-Plan]
```

NACH Freigabe: Phase 2 starten. Nach jedem Phasen-Ende: 
typecheck + lint + build + manueller Test beschreiben.
```
