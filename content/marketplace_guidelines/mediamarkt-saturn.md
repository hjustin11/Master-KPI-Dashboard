# MediaMarkt & Saturn — Listing- & Integrations-Richtlinien (Mirakl)

> Stand: 2026-04-21 — basiert auf den offiziellen MMS Content-Guidelines (Q2 2023)
> und den MMS Seller Onboarding Guides (Schritt 1–4).

## 1. Plattform-Überblick

- **Mirakl-Operator**: MediaMarktSaturn Retail Group
- **Mirakl-API-Basis-URL**: `https://mediamarktsaturn.mirakl.net`
- **Seller-Portal**: `https://mediamarktsaturn.mirakl.net/mmp/shop/home`
- **KYC-Verifizierung**: via Hyperwallet (erforderlich vor Payout)
- **Länder**: DE, AT (EU-weite Expansion geplant)
- **Plattform-Charakter**: Technik-fokussiert, technisch-sachliche Kundschaft. Auch bei
  Haustierbedarf (Kategorie **PET CARE**) werden präzise Spezifikationen erwartet.
- **Tonalität**: faktenorientiert, messbare Eigenschaften priorisieren, keine Marketing-Floskeln.

## 2. Upload-Flow (Seller → Mirakl → Katalog)

```
1. Seller lädt Produkt-CSV/Excel/XML per Backoffice/API hoch
2. Mirakl validiert → Status VALIDATION
3. Operator (MMS) Accepts → Status ACCEPTANCE
4. Sync zum Marktplatz-Katalog → Status SYNCHRONIZATION
5. OFFER-Upload (Preis/Bestand) verknüpft sich via Product ID
6. Listing live → Kunde kauft → Order-Workflow beginnt
```

### Status-Typen (Backoffice: Catalog > My Products > Status)

| Status | Bedeutung |
|---|---|
| VALIDATION | Mirakl prüft technische Konformität |
| ACCEPTANCE | Operator (MMS) prüft redaktionell |
| SYNCHRONIZATION | Live-Sync zum Frontend |
| VALIDATION_ERROR | Fehler → Rejection-Code-Spalte lesen |
| CLOSED | Produkt aus Katalog entfernt |

## 3. Kategoriestruktur (3-stufig)

MMS nutzt einen **3-Level-Kategoriebaum**. Beim PM01-Upload wird der **Leaf-Code**
(letzte Ebene) in die Spalte `Category` geschrieben — **nicht der deutsche Label-Text**.

### Top-Level-Kategorien (Auswahl)

- COMPUTER
- ENTERTAINMENT
- HOME APPLIANCES
- TV & AUDIO
- SMARTPHONES & TELEFONE
- FOTO
- HEALTH & BEAUTY
- **PET CARE** ← relevant für unsere Safari-Lodge / Haustier-Produkte
- SPORT
- GAMING
- OFFICE
- SMART HOME

### Beispiel: 3-stufiger Pfad

```
COMPUTER > HARDWARE > NOTEBOOKS
PET CARE > CAT > SCRATCHING_POST      (Beispiel-Pfad, Leaf-Code im Backoffice abrufen)
```

### Wie finde ich den echten Leaf-Code?

1. Login Backoffice → **Catalog > Templates**
2. Kategorie auswählen (z. B. PET CARE)
3. **"Generate template"** klicken → Excel enthält Header-Zeile mit `Category`-Feld
   und Beispiel-Wert des Leaf-Codes
4. Alternativ: **My Products > Category** → Codes werden inline angezeigt

> ⚠️ Der Code ist **NICHT** der deutsche Anzeige-Label (z. B. „Kratzmöbel"), sondern
> ein technischer Code aus dem MMS-Katalog. Freitext-Labels werden mit
> `CAT` (Category unknown) abgelehnt.

## 4. Attribut-Codes (zentrale Referenz)

MMS nutzt zwei Code-Präfix-Familien:

### 4.1 `PROD_FEAT_XXXXX` — Produkt-Features (Katalog-Attribute)

Diese kommen in der Produkt-CSV (PM01) und bestimmen, wie das Produkt im
Marktplatz-Katalog normalisiert wird.

| Code | Bedeutung | Typ | Beispiel |
|---|---|---|---|
| `PROD_FEAT_10990` | **Produkttyp** | LIST | `Notebook`, `Kratzbaum`, `Futternapf` |
| `PROD_FEAT_00003` | **Farbe (normiert)** | LIST | `Schwarz`, `Beige`, `Weiß` |
| `PROD_FEAT_10812` | **Farbe laut Hersteller** (Freitext) | TEXT | `Tiefschwarz matt` |
| `PROD_FEAT_16859` | **Altersempfehlung** (für Toys / Pet) | LIST | `ab 3 Monate`, `Adult`, `Senior` |
| `PROD_FEAT_16042` | **Sicherheitshinweis** | TEXT | Gem. Spielzeug-RL |
| `PROD_FEAT_10285` | **Material (Haupt)** | LIST | `Sisal`, `Holz`, `Plüsch` |
| `PROD_FEAT_10304` | **Material (Bezug/Oberfläche)** | LIST | `Baumwolle`, `Kunstleder` |
| `PROD_FEAT_15670` | **Empfohlen für** (Tierart bei PET CARE) | LIST | `Katze`, `Hund`, `Vogel` |

> Bei **Toys** (und analog: Haustier-Spielzeug) sind **PROD_FEAT_16859, 16042,
> 10285, 10304, 15670, 10990** zusätzlich **Pflicht**.

### 4.2 `ATTR_PROD_MP_XXXXX` — Marketplace-Operational-Attribute

Diese steuern Energie-Label, Varianten und Zusatz-Media. Fehler hier sind häufig
Rechts-/Compliance-Fehler (EU 2017/1369 Energielabel-Verordnung).

| Code | Bedeutung | Pflicht wenn... |
|---|---|---|
| `ATTR_PROD_MP_EnergyLabel` | URL zum Energielabel-PDF | Gerät fällt unter EU 2017/1369 |
| `ATTR_PROD_MP_EnergyDataSheet` | URL zum Produktdatenblatt | siehe oben |
| `ATTR_PROD_MP_EnergyLabel_EU2017/1369` | **EPREL-ID** des Produkts | Neue Energielabel-VO (ab 2021) |
| `ATTR_PROD_MP_VariantGroupCode` | **VGC** — Varianten-Gruppenschlüssel | Produkt ist Teil einer Farb/Größen-Serie |
| `ATTR_PROD_MP_Manufacturer_PartNumber` | Hersteller-Teilenummer (MPN) | **immer empfohlen** |
| `ATTR_PROD_MP_AdditionalImage1` (bis 10) | Zusatzbild-URLs | mind. 1 Hauptbild Pflicht |

### 4.3 Titel-Regel (Content-Guideline)

- **Max. 50 Zeichen** im Titelfeld
- **Nur Modellname** (kein Marketing, kein „NEU!", keine Emojis)
- Technische Kernmerkmale gehören in die Beschreibung und strukturierte Attribute
- Marke steht in **separater Spalte** (`brand`), nicht im Titel wiederholen

### 4.4 Beschreibungs-HTML (erlaubte Tags)

Nur folgende Tags dürfen in `description`:

```html
<ul>, <li>, <br>, <h3>, <strong>, <p>, &bull;
```

Andere Tags (div, span, style, img, table) werden **gestrippt**.

## 5. Bild-Anforderungen

| Anforderung | Wert |
|---|---|
| Mindestauflösung | **1200 × 1200 px** (nicht 1000) |
| Farbraum | **RGB** (nicht CMYK) |
| Hintergrund (Hauptbild) | **Weiß, einfarbig (solid)** |
| Maximale Anzahl | 10 Bilder (1 Hauptbild + 9 `AdditionalImage1..9`) |
| Format | JPG, PNG |
| Zusatzbilder | Lifestyle, Detail, Anschlüsse, Größenvergleich |

> Bild-URLs müssen **öffentlich erreichbar** sein (kein Auth, kein Referrer-Check).

## 6. Offer-CSV (OF01) — Preis/Bestand

Der Produkt-Upload (PM01) enthält **keine** Preise/Bestände. Diese werden per
separatem **Offer-CSV** geladen und via `Product ID` mit dem Produkt verknüpft.

### Pflichtfelder Offer-CSV

| Feld | Bedeutung | Beispiel |
|---|---|---|
| `Offer SKU` | deine interne SKU | `PLSP-003BK` |
| `Product ID` | Produkt-Referenz | `4006438123456` |
| `Product ID Type` | einer von: `EAN`, `SKU`, `SHOP_SKU` | `EAN` |
| `Offer Price` | Verkaufspreis (Brutto) | `49.99` |
| `Offer Quantity` | Lagerbestand | `25` |
| `Offer State` | Produktzustand | `NEW` (auch `USED`, `REFURBISHED`) |
| `Strike-Price-Type` | für UVP-Streichpreis | `recommended-retail-price` |
| `Strike-Price` | UVP-Wert | `69.99` |
| `Logistic Class` | Versand-Klasse (operator-abhängig) | `STD_DE` |
| `Available Start` | Verfügbar ab | `2026-04-21` |
| `Available End` | Verfügbar bis | leer = unbefristet |
| `Leadtime to ship` | Vorlaufzeit (Tage) | `1` |

## 7. Rejection-Codes (Validation-Error-Spalte)

Bei `VALIDATION_ERROR` steht der Code in der Rejection-Spalte — hier die häufigsten:

| Code | Bedeutung | Lösung |
|---|---|---|
| `AGE` | Altersangabe fehlt/ungültig (Toys/Pet) | `PROD_FEAT_16859` setzen |
| `ATE` | Attribut-Fehler EAN | EAN 13-stellig, Prüfziffer korrekt |
| `ATS` | Attribut: Strukturfehler | Pflichtfeld fehlt (→ Template prüfen) |
| `ATD` | Attribut: Datentyp falsch | z. B. Text in Number-Feld |
| `ATC` | Attribut: Kategorie-Mismatch | Attribut gehört nicht zur Kategorie |
| `CAT` | **Kategorie unbekannt** | Leaf-Code aus Backoffice-Template holen |
| `DSM` | Beschreibung zu kurz/fehlt | mind. ~500 Zeichen sinnvoller Text |
| `DSW` | Beschreibung: verbotene Wörter | Marketing-Claims entfernen |
| `EAN` | EAN ungültig / Duplikat | andere EAN oder `SHOP_SKU` nutzen |
| `ELN` | Energy-Label: keine Angabe | `ATTR_PROD_MP_EnergyLabel` setzen |
| `ELO` | Energy-Label: veraltetes Format | EPREL-ID (`EU2017/1369`) nutzen |
| `ECO` | Energy-Label: Datenblatt fehlt | `EnergyDataSheet`-URL setzen |
| `ECN` | Energy-Label: Klasse inkonsistent | PDF vs. Attribut gleich setzen |
| `ELE` | Energy-Label: URL nicht erreichbar | PDF öffentlich hosten |
| `IMG` | Bild-URL ungültig | Public-URL, kein Auth |
| `IMO` | Bild: Auflösung zu niedrig | ≥ 1200×1200 px |
| `IMM` | Bild: Mime-Type falsch | JPG oder PNG |
| `LDE` | Lieferzeit fehlt | `Leadtime to ship` in Offer setzen |
| `LES` | Lieferzeit unrealistisch | 1–30 Tage realistisch |
| `MEC` | Meta-Fehler: Pflichtfelder | Template regenerieren |
| `TTL` | Titel zu lang | **max. 50 Zeichen** |
| `TTB` | Titel: verbotene Zeichen | keine Emojis, keine Caps-Lock-Sätze |

## 8. Varianten (VariantGroupCode)

Für Farbsortimente/Größen-Serien nutzt MMS `ATTR_PROD_MP_VariantGroupCode` (VGC).

- Gleicher VGC-Wert auf allen Varianten → sie werden auf der PDP als **Variant-Picker**
  dargestellt.
- Typisches Format: interner Schlüssel + Suffix, z. B.
  - `PLSP-003-BK` → `VGC_PLSP-003`
  - `PLSP-003-WH` → `VGC_PLSP-003`
  - `PLSP-003-BGE` → `VGC_PLSP-003`
- Varianten-differenzierende Attribute (Farbe/Größe) **müssen je Variante unterschiedlich** sein.

## 9. Order-Workflow (Seller-Sicht)

```
PENDING_ACCEPTANCE   → Käufer hat bezahlt, Seller muss akzeptieren (i.d.R. auto)
DEBIT_IN_PROGRESS    → MMS zieht Geld vom Kunden ein
AWAITING_SHIPMENT    → Seller MUSS versenden + Tracking hochladen
SHIPPED              → Sendung unterwegs
RECEIVED             → Kunde hat erhalten
CLOSED               → Order finalisiert, Payout berechenbar
REFUSED / CANCELED   → Abbruch
```

- Pflicht: Tracking-Upload ≤ 48 h nach `AWAITING_SHIPMENT` (Performance-Metrik)
- Rückgaben: Kunde kann 14 Tage ab Erhalt retournieren; MMS steuert `REFUND`-Flow

## 10. Länder-/Rechts-Hinweise (DE/AT)

- **Germany**: Grundpreis-Verordnung (GrundPrV) gilt — z. B. Futter pro kg, Einstreu pro Liter
- **Austria**: VO (EU) 2019/1020 Product Safety — Hersteller-Daten (Anschrift) in `ATTR_PROD_MP_Manufacturer_PartNumber` + `brand`
- **Energielabel**: EU 2017/1369 + delegierte VO — **EPREL-Registrierung ist Pflicht** vor Upload
- **Spielzeug-Richtlinie 2009/48/EG**: Sicherheitshinweis (`PROD_FEAT_16042`) Pflicht, CE-Kennzeichnung im Bild empfohlen

## 11. Verbotene Claims / Content

- Unbelegte Leistungsangaben (z. B. „stärkstes Kratzmöbel")
- Falsche Energielabel-Klassen (Bußgeld-Risiko)
- Konkurrenz-Vergleiche mit anderen Marken
- Medizinische Heilversprechen (Tiermedizin-Recht bei PET CARE)
- Grüne Claims ohne Zertifikat (EU Green-Claim-Directive)

## 12. API-Endpunkte (Mirakl-Standard bei MMS)

Alle unter `https://mediamarktsaturn.mirakl.net/api`:

| Pfad | Zweck |
|---|---|
| `POST /api/products/imports` | PM01-Produkt-Upload (Multipart CSV/Excel/XML) |
| `POST /api/offers/imports` | OF01-Offer-Upload |
| `GET /api/products/imports/{importId}` | Status-Polling |
| `GET /api/products/imports/{importId}/error_report` | Rejection-CSV abrufen |
| `GET /api/hierarchies` | Kategorie-Baum (3 Levels) |
| `GET /api/products/attributes` | alle `PROD_FEAT_*` + `ATTR_PROD_MP_*` mit Typ-Info |
| `GET /api/values_lists` | erlaubte Werte für `LIST`-Attribute |
| `GET /api/orders` | Order-Fetch (mit `order_state_codes`-Filter) |
| `PUT /api/orders/{orderId}/tracking` | Tracking-Upload |
| `PUT /api/orders/{orderId}/ship` | Bestellung als versendet markieren |

Authentifizierung: Header `Authorization: <apiKey>` (nicht `Bearer`).

## 13. Debug-Tipps (wenn Upload abgelehnt wird)

1. **Rejection-CSV abrufen** (`/api/products/imports/{id}/error_report`) — enthält
   Zeile, Spalte, Code und Human-Readable-Message.
2. **Template regenerieren** (Backoffice > Catalog > Templates > Excel-Download)
   und Header-Zeile mit aktuellem Upload vergleichen — Attribut-Codes ändern sich.
3. **Values-Lists abrufen** (`/api/values_lists`) — gibt pro LIST-Attribut die
   erlaubten Werte; häufig ist der eingetragene String nicht-enumeriert.
4. **Hierarchies cachen** — `/api/hierarchies` einmal pro Tag abrufen, Leaf-Codes
   in lokaler Map, damit DE-Label → Code resolved werden kann.

## 14. Mapping-Cheatsheet (unsere Domäne → MMS-Felder)

| Unser Feld (Master-DB) | MMS-Code |
|---|---|
| `title` | `title` (max 50 Z., Modell-only) |
| `description` | `description` (HTML: ul/li/br/h3/strong/p) |
| `brand` | `brand` |
| `ean` | `ean` (Produkt) bzw. `Product ID` (Offer) |
| `category_path` (DE-Label) | **nicht direkt** → auflösen zu Leaf-Code für `category` |
| `color` (normiert) | `PROD_FEAT_00003` |
| `color_raw` (Hersteller) | `PROD_FEAT_10812` |
| `material_primary` | `PROD_FEAT_10285` |
| `material_cover` | `PROD_FEAT_10304` |
| `age_group` | `PROD_FEAT_16859` |
| `animal_species` (Katze/Hund/...) | `PROD_FEAT_15670` |
| `product_type` | `PROD_FEAT_10990` |
| `mpn` | `ATTR_PROD_MP_Manufacturer_PartNumber` |
| `variant_group_key` | `ATTR_PROD_MP_VariantGroupCode` |
| `image_primary_url` | `mainImage` / `AdditionalImage0` |
| `image_urls[1..9]` | `ATTR_PROD_MP_AdditionalImage1..9` |
| `price_eur` (Brutto) | `Offer Price` (Offer-CSV) |
| `stock_quantity` | `Offer Quantity` |
| `rrp_eur` | `Strike-Price` (`Strike-Price-Type=recommended-retail-price`) |
| `lead_days` | `Leadtime to ship` |

## 15. Fehler-Präventions-Regeln (für unseren Dispatcher)

1. **Nie** einen deutschen Kategorie-Label (z. B. „Kratzmöbel") in `category` senden
   — immer vorab über `/api/hierarchies` oder gecachte Map zu Leaf-Code auflösen.
2. **Titel auf 50 Z. hart kappen** vor dem Upload.
3. **HTML whitelist-stripen** (`sanitize-html` mit nur [ul,li,br,h3,strong,p]).
4. **Bilder prüfen**: HEAD-Request, Mime-Type, 1200×1200-Minimum (via `sharp`).
5. **EAN-Dublettencheck** gegen MMS-Katalog (`GET /api/products?offer_state_codes=...`) — wenn Hit, nutze `Product ID Type=SHOP_SKU` statt `EAN`.
6. **VGC immer gleich** über alle Farbvarianten einer Serie.

## 16. Referenz-Links

- Seller-Portal: <https://mediamarktsaturn.mirakl.net/mmp/shop/home>
- Mirakl Help (Seller): <https://help.mirakl.com/bundle/sellers>
- Operator Template Doc: <https://help.mirakl.com/bundle/sellers/page/topics/Mirakl/mmp/Seller/sellers_doc/seller_onboarding/product_offer_upload_using_operator_template.html>
- EPREL-Register: <https://eprel.ec.europa.eu/>
- Mirakl API Docs: <https://help.mirakl.com/bundle/sellers/page/topics/Mirakl/api/api_overview.html>
