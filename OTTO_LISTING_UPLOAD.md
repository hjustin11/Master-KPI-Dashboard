# Otto Market — Listing Upload Referenz

Stand: 2026-04-24. Basis: `otto-de/marketplace-php-sdk` (archiviert 2024-06, aber OpenAPI-generierte Models + Client-Code in `generated/products/Model/*.php` und `src/Client/PartnerProductClient.php`) + öffentliche API-Docs unter https://api.otto.market/docs/.

Der PHP-SDK ist nützlich für die **Feldnamen + Typen der ProductVariation**, aber der Pfad-Prefix hat sich geändert:

> ⚠️ **API-Version v5 (seit 2025-12-10)** — v4 wurde am 10.12.2025 abgeschaltet. Der archivierte PHP-SDK nutzt v2 → das führt zu `"No Route matched with those values"`. Alle Endpoints unten sind auf v5 aktualisiert.
>
> **Schema-Änderung v4 → v5 (2025-05-05)**: `productSafety` ist vom Top-Level in einen neuen `compliance`-Container umgezogen (für GPSR-Compliance seit 2024-12). Für Food/Tiernahrung gibt es `compliance.foodInformation` statt `productSafety`. Die grundsätzliche ProductVariation-Shape (productReference, sku, ean, productDescription, mediaAssets, delivery, pricing, logistics) bleibt aus v2 unverändert.

---

## 1. Endpoints

| Pfad | Methode | Zweck |
|---|---|---|
| `/v5/products` | `POST` | Produkt-Variationen anlegen/aktualisieren (Array von ProductVariation, max 500). Antwort asynchron: `state: pending`, `links.self` → Task-UUID für Polling. |
| `/v5/products` | `GET` | Eigene Listings lesen (Filter: `sku`, `productReference`, `category`, `brand`). |
| `/v5/products/brands` | `GET` | Alle Otto-bekannten Marken. **Upload muss genau einen dieser Namen verwenden** — sonst 400 `brand.not.allowed`. |
| `/v5/products/categories?limit=100` | `GET` | Alle Sortiments-Kategorien paginiert. Jede Gruppe (`CategoryGroup`) enthält: `categoryGroup`, `categories[]` (die eigentlichen Kategorie-Strings, wie "Kratzbäume"), `variationThemes[]`, `title`, `attributes[]` (AttributeDefinition — **hier stehen die Pflicht-Attribute pro Kategorie!**), `additionalRequirements[]` (bedingte Anforderungen, z. B. "falls Attribut X = Wert Y → Feld Z pflicht"). |
| `/v5/products/{sku}/marketplace-status` | `GET` | Listing-Status abfragen. |
| `/v5/products/{sku}/active-status` | `GET` | Aktiv/Pausiert. |
| `/v5/products/active-status` | `POST` | Aktiv/Pausiert setzen. |
| `/v5/products/update-tasks/{uuid}` | `GET` | Upload-Fortschritt pollen. Antwort: `state` ∈ {pending, failed, successful}. |

OAuth: `POST /v1/token` mit `grant_type=client_credentials`, Scope **muss `products` enthalten** für POST/GET /v5/products. Basis-URL im Dashboard: `OTTO_API_BASE_URL` (live: `https://api.otto.market`).

---

## 2. ProductVariation — vollständige Felder

Aus `generated/products/Model/ProductVariation.php`:

| Feld | Typ | Pflicht? | Notiz |
|---|---|---|---|
| `productReference` | string | **ja** | Eigener Produkt-Identifier (gleicher SKU-Stamm für Varianten). |
| `sku` | string | **ja** | Eindeutige Varianten-SKU. |
| `ean` | string | **ja*** | GTIN-13. Pflicht, außer wenn eines der Alternativ-Felder (`isbn/upc/pzn/mpn/moin`) gesetzt ist. |
| `isbn` / `upc` / `pzn` / `mpn` / `moin` | string | optional | Alternativen zur EAN je nach Produktart. |
| `offeringStartDate` | date-time | optional | ISO-8601. Vor diesem Datum wird Listing nicht aktiv. |
| `releaseDate` | date-time | optional | Ankündigungstermin. |
| `maxOrderQuantity` | int | optional | Max. Bestellmenge pro Kunde. |
| `productDescription` | ProductDescription | **ja** | Siehe §3. |
| `mediaAssets` | MediaAsset[] | **ja** | Mindestens 1 Bild empfohlen, max 10 üblich. Siehe §6. |
| `delivery` | Delivery | **ja** | Siehe §7. |
| `pricing` | Pricing | **ja** | Siehe §8. |
| `logistics` | Logistics | **ja** | Siehe §9. |

---

## 3. ProductDescription

| Feld | Typ | Pflicht? | Notiz |
|---|---|---|---|
| `category` | string | **ja** | Exakter Otto-Kategoriename aus `/v5/products/categories` (z. B. `"Kratzbäume"`). Case-sensitive. |
| `brand` | string | **ja** | Exakter Markenname aus `/v5/products/brands`. |
| `description` | string | **ja** | HTML-freier Langtext (Plain + Zeilenumbrüche). Otto schlägt max ~4000 Zeichen vor. |
| `bulletPoints` | string[] | empfohlen | 3–7 Kernfeatures, je Eintrag ≤ 250 Zeichen. |
| `productLine` | string | optional | Produktlinie/Serie (z. B. "Happy Cat Adult"). |
| `manufacturer` | string | optional | Herstellername, falls ≠ `brand`. |
| `productionDate` | date | optional | Herstellungsdatum. |
| `multiPack` | bool | optional | `true`, wenn Multipack (z. B. 6er-Pack). |
| `bundle` | bool | optional | `true`, wenn Produktbündel verschiedener Artikel. |
| `fscCertified` | bool | optional | Holz-/Papier-Produkte. |
| `disposal` | bool | optional | Elektro-/Batterie-/Entsorgungspflicht. |
| `productUrl` | string | optional | URL zur Produktseite im eigenen Shop (Original). |
| `attributes` | Attribute[] | **kategorie-abhängig** | Kategorie-spezifische Pflichtfelder, siehe §4. |

---

## 4. Attribute (kategorie-abhängig)

Struktur jedes Eintrags:

```json
{ "name": "Farbe", "values": ["Braun"], "additional": false }
```

- `name` — Attribut-Name exakt wie in `CategoryGroup.attributes[].name`.
- `values` — immer `string[]`, auch bei Single-Value. Für Enum-Attribute muss `values[0]` in `allowedValues` sein.
- `additional` — `true` bei optionalen/zusätzlichen Attributen; `false` oder weglassen für Pflichtattribute.

**Pflicht-Attribute pro Kategorie** muss man aus `AttributeDefinition` der passenden `CategoryGroup` lesen:

| AttributeDefinition-Feld | Typ | Bedeutung |
|---|---|---|
| `name` | string | Attribut-Name (exakter Key für `Attribute.name`). |
| `attributeGroup` | string | UI-Gruppierung (z. B. "Technische Details"). |
| `type` | string | `text` / `number` / `boolean` / `enum` / `date`. |
| `multiValue` | bool | Erlaubt mehrere Werte in `values[]`. |
| `unit` / `unitDisplayName` | string | z. B. `"cm"`, `"g"`. |
| `allowedValues` | string[] | Enum-Werte. |
| `exampleValues` / `recommendedValues` | string[] | Beispiele für Freitext-Attribute. |
| `relevance` | string | `MANDATORY` / `RECOMMENDED` / `OPTIONAL`. |
| `featureRelevance` | string[] | Welche Features das Attribut auslöst (z. B. "varianten-bildung"). |

Für einen konkreten Kategorie-Download: `GET /v5/products/categories` komplett paginieren, in JSON filtern auf `categories[] contains "Kratzbäume"`, dann die `attributes[]` mit `relevance = "MANDATORY"` rausziehen.

---

## 5. AdditionalRequirement (conditional)

Wenn in der CategoryGroup `additionalRequirements[]` gesetzt ist, greift ein Conditional-Zwang:

```json
{
  "name": "normPriceInfo",
  "jsonPath": "$.pricing.normPriceInfo",
  "description": "bei Grundpreiskennzeichnungspflicht",
  "reference": "...",
  "condition": {
    "name": "category",
    "jsonPath": "$.productDescription.category",
    "value": "Shampoo"
  }
}
```

Heißt: Wenn Kategorie = "Shampoo", muss `pricing.normPriceInfo` befüllt sein. **Unser Builder muss diese Regeln berücksichtigen** (siehe §8 NormPriceInfo).

---

## 6. MediaAsset

```json
{ "type": "IMAGE", "location": "https://.../img-1.jpg", "filename": "img-1.jpg" }
```

- `type`: `IMAGE` (Dokumente wie "TECHNICAL_DRAWING" möglich, aber hier irrelevant).
- `location`: **HTTPS-Pflicht**, öffentlich erreichbar (Otto crawlt).
- `filename`: nur informativ; Fallback `image-${idx}.jpg`.

Otto erwartet mind. ein Bild (Primärbild = `[0]`). Empfehlung: 4–10 Bilder, Hintergrund weiß, min. 1500×1500px.

---

## 7. Delivery

```json
{ "type": "PARCEL", "deliveryTime": 2 }
```

- `type`: `PARCEL` (normaler Paketversand) oder `FORWARDING` (Spedition, sperrig/schwer).
- `deliveryTime`: Werktage bis zur Lieferung (int, 1–30).

---

## 8. Pricing

```json
{
  "standardPrice": { "amount": 49.99, "currency": "EUR" },
  "vat": "FULL",
  "msrp": { "amount": 59.99, "currency": "EUR" },
  "sale": { "salePrice": { "amount": 44.99, "currency": "EUR" }, "startDate": "2026-04-25T00:00:00Z", "endDate": "2026-05-05T23:59:59Z" },
  "normPriceInfo": { "normAmount": 100, "normUnit": "g", "salesAmount": 250.0, "salesUnit": "g" }
}
```

- `vat`: `FULL` (19 %) / `HALF` (7 %) / `NONE` / `NONE_INTRA_COMMUNITY`.
- `msrp`: UVP (optional, erhöht Display-Wertigkeit).
- `sale`: zeitgebundene Rabatt-Aktion (optional).
- `normPriceInfo`: Grundpreis-Angabe nach deutscher PAngV. Pflicht bei bestimmten Kategorien (siehe §5).

---

## 9. Logistics + PackingUnit

```json
{
  "packingUnitCount": 1,
  "packingUnits": [
    { "weight": 1500, "width": 250, "height": 180, "length": 400 }
  ]
}
```

- `packingUnitCount`: Anzahl Kartons (1 = ein Paket). **Muss ≥ 1 sein.**
- `packingUnits[]`: Dimensionen je Paket.
  - `weight`: **Gramm** (int).
  - `width` / `height` / `length`: **Millimeter** (int).

**Wichtig**: Otto rechnet nicht in cm/kg → wir müssen Xentral-cm × 10 und Xentral-kg × 1000 umrechnen.

---

## 10. Antwort + Task-Polling

`POST /v5/products` liefert synchron `202 Accepted` + Body:

```json
{
  "state": "pending",
  "progress": 0,
  "total": 1,
  "pingAfter": "2026-04-24T12:03:00Z",
  "links": [
    { "rel": "self", "href": "/v5/products/update-tasks/abc-uuid-123" },
    { "rel": "result", "href": "/v5/products/update-tasks/abc-uuid-123/result" }
  ]
}
```

**Polling-Loop**: `GET {self-link}` alle `pingAfter`-Sekunden bis `state != "pending"`. Bei `state = "failed"` oder `"successful"`, `GET {result-link}` für die eigentlichen Fehler pro Variation:

```json
{
  "results": [
    {
      "variation": "PLSP-003BGE",
      "urlToShopProduct": null,
      "errors": [
        {
          "code": "validation.category.not.found",
          "title": "Kategorie 'Kratzbäume' existiert nicht.",
          "path": "productDescription.category",
          "jsonPath": "$.productDescription.category",
          "logref": "abc-123"
        }
      ]
    }
  ]
}
```

`code`-Präfixe, die wir erwarten:
- `validation.*` — strukturelle Fehler (falscher Feldname, fehlendes Pflichtfeld).
- `brand.not.allowed` — Markenname nicht in `/brands`-Liste.
- `category.not.found` — Kategoriename nicht in `/categories`-Liste.
- `attribute.mandatory.missing` — Pflicht-Attribut fehlt.
- `attribute.value.not.allowed` — `values[0]` nicht in `allowedValues`.

---

## 11. Stolpersteine (Lessons von Amazon/Fressnapf übertragbar)

1. **Brand-Pollution-Falle**: Otto hat eine feste Markenliste. Wenn wir einen Markennamen senden, den Otto nicht kennt → Reject mit `brand.not.allowed`. **Fix**: Vor Upload `/v5/products/brands` prüfen, ggf. Markenname mappen (z. B. "Happy Cat GmbH" → "Happy Cat").

2. **Category-Namen exact-match**: Keine deutsche Mehrdeutigkeit ("Kratzbaum" vs. "Kratzbäume"). Nur Werte aus `/v5/products/categories`.

3. **`packingUnits` in Millimeter/Gramm, nicht cm/kg**: Fehler bei 1:1-Übernahme aus Xentral (cm, kg) → wir rechnen um.

4. **`description` darf kein HTML enthalten**: Xentral liefert teilweise HTML-Tags, die wir strippen müssen.

5. **Pflicht-Attribute pro Kategorie**: Wir können nicht pauschal annehmen, welche Attribute Pflicht sind — das hängt von der Otto-Kategorie ab. Unser `ottoRequiredAttributes`-Builder muss nach Category-Lookup entscheiden (oder mindestens die wichtigsten Basis-Attribute stellen: Farbe, Material, Maße, Gewicht, Zielgruppe).

6. **Async-Verarbeitung**: `202 Accepted` heißt nur "Request angekommen". Der eigentliche Fehler kommt beim Polling via `update-tasks/{uuid}/result`. Unser Dashboard muss das trackable machen (Task-UUID speichern → später pollen).

---

## 12. Mapping-Vorschlag (Xentral → Otto)

| Xentral-Feld | Otto-Feld | Konversion |
|---|---|---|
| `sku` | `sku` + `productReference` | identisch. |
| `ean` | `ean` | identisch, leer → weglassen. |
| `brand` | `productDescription.brand` | **Lookup gegen `/v5/products/brands`** vorher. |
| `name` | — | nicht direkt mappbar; Otto nutzt kategorie-attribute für Namen. |
| `description` | `productDescription.description` | HTML strippen, max ~4000 Zeichen. |
| `categoryPath` | `productDescription.category` | **Lookup gegen `/v5/products/categories`**. Muss der letzte Segment-Name sein. |
| `price` | `pricing.standardPrice.amount` | Currency: EUR. |
| `weight` (kg) | `logistics.packingUnits[0].weight` | **× 1000** (g). |
| `dimL` (cm) | `logistics.packingUnits[0].length` | **× 10** (mm). |
| `dimW` (cm) | `logistics.packingUnits[0].width` | **× 10** (mm). |
| `dimH` (cm) | `logistics.packingUnits[0].height` | **× 10** (mm). |
| `images[]` | `mediaAssets[]` | nur HTTPS, max 10. |
| `handlingTime` | `delivery.deliveryTime` | int, min 1. |

---

## 13. Schritt-für-Schritt Prozess

1. **Vorbereitung (Discovery, einmalig pro Kategorie)**:
   - `GET /v5/products/categories` komplett ziehen → lokaler Cache.
   - `GET /v5/products/brands` → lokaler Cache.
   - Für unsere Target-Kategorien (z. B. Kratzbäume, Hundespielzeug, Katzenfutter) die `AttributeDefinition` mit `relevance = MANDATORY` extrahieren.

2. **Listing-Anlage**:
   - User öffnet Cross-Listing-Dialog → Preparer baut `ProductVariation` anhand Xentral-Daten.
   - `ottoRequiredAttributes()`-Builder füllt kategorie-spezifische Pflicht-Attribute mit Smart-Defaults aus Xentral-Data (Farbe, Material, Dimensionen, etc.).
   - User prüft im Attribut-Editor, korrigiert.
   - Submit → `POST /v5/products`.

3. **Fehler-Handling**:
   - `202 Accepted` → Task-UUID speichern.
   - UI zeigt "Otto verarbeitet asynchron — UUID: xyz".
   - Follow-up: `/api/otto/task-status?uuid=xyz` pollen, bis `state != pending`.
   - Bei `failed` → error-codes parsen, User-Hint generieren ("Kategorie 'Kratzbäume' existiert nicht. Nächste Treffer: …").

4. **Roll-Forward**:
   - Bei erfolg: Listing-Status in Dashboard auf "aktiv".
   - Bei Fehler: User-Editor zeigt genau die Felder an, die Otto gerügt hat.

---

## 14. Referenzen

- Otto Market API Portal: https://api.otto.market/docs/
- Functional Interfaces — Products: https://api.otto.market/docs/functional-interfaces/products/
- PHP SDK (archiviert, aber OpenAPI-Models gültig): https://github.com/otto-de/marketplace-php-sdk
- Changelog (API-Versionen): https://api.otto.market/docs/changelog/
- Sandbox: https://api.otto.market/docs/about-the-api/sandbox/
