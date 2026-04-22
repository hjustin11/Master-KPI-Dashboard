# Fressnapf.de — Listing- & Integrations-Richtlinien (Mirakl)

> Stand: 2026-04-21 — basiert auf Fressnapf-Mirakl-API-Probes (`/api/hierarchies`,
> `/api/products/attributes`, `/api/values_lists`) via
> [/api/fressnapf/categories-debug](src/app/api/fressnapf/categories-debug/route.ts).

## 1. Plattform-Überblick

- **Mirakl-Operator**: Fressnapf Tiernahrungs GmbH
- **Mirakl-API-Basis-URL**: `https://fressnapfde-prod.mirakl.net`
- **Seller-Portal**: `https://fressnapfde-prod.mirakl.net/mmp/shop/home`
- **Plattform-Charakter**: Ausschließlich Haustierbedarf. Emotional-fachliche
  Ansprache an Tierhalter.
- **Tonalität**: warm, tierfreundlich, fachkompetent.
- **Schlüsselbotschaft**: Wohlbefinden des Tieres.

## 2. Upload-Flow (Seller → Mirakl → Katalog)

```
1. PM01-Upload (Produkt-CSV)  → Status VALIDATION
2. Mirakl-Validation          → ACCEPTANCE (Operator-Review)
3. Katalog-Sync               → SYNCHRONIZATION (live)
4. OF01-Upload (Offer-CSV)    → Preis + Bestand, verknüpft via Product-ID (EAN)
5. Listing live               → Bestellung → Order-Workflow
```

## 3. Kategorie-Codes (Mirakl-Hierarchy)

**KRITISCH**: Fressnapf nutzt **NICHT** die numerischen WGR-Codes aus
`Fressnapf_Warengruppen.xlsx` (z. B. `201001`). Der PM01-Upload erwartet
**Mirakl-Hierarchy-Codes** im Format `marketplace_*` — alles andere wird mit
`1001|The category XXX is unknown` (Fehler 120065 / 120076 / 120086) abgelehnt.

Alle 37 Codes sind in [fressnapfCategories.ts](src/shared/lib/crossListing/fressnapfCategories.ts)
gepflegt. Hier die vollständige Referenz:

### 3.1 Tier-bezogen (erfordern `animal_categories`-Attribut, s. §4.1)

| Code | Deutscher Label |
|---|---|
| `marketplace_animal_care_aid` | Tier-Pflegehilfe (Bürsten, Schermaschinen) |
| `marketplace_animal_care_product` | Tier-Pflegemittel (Shampoo, Ungeziefer) |
| `marketplace_animal_clothing` | Tier-Bekleidung (Mantel, Pullover) |
| `marketplace_animal_diaper_protective_pant` | Tier-Windeln & Schutzhöschen |
| `marketplace_animal_drink` | Tier-Getränk |
| `marketplace_animal_feeding_drink_dispenser` | Tier-Fütterungszubehör & Tränken (Napf, Brunnen) |
| `marketplace_animal_flap_door` | Tier-Klappen & Türen |
| `marketplace_animal_food` | Tier-Futter (Trocken/Nass) |
| `marketplace_animal_harness_collar_muzzle` | Tier-Geschirre, Halsbänder & Maulkörbe |
| `marketplace_animal_housing` | Tier-Behausung (Höhlen, Hütten, Lodges) |
| `marketplace_animal_housing_facility` | Tier-Behausungseinrichtung |
| `marketplace_animal_leash` | Tier-Leinen (Rollleine, Flexileine) |
| `marketplace_animal_nutritional_supplement` | Tier-Nahrungsergänzung |
| `marketplace_animal_otc_medication` | Tier-OTC-Medikamente |
| `marketplace_animal_scratch_accessory` | Tier-Kratzzubehör (Kratzbaum, -brett, -papp) |
| `marketplace_animal_sleeping_place` | Tier-Schlafplatz (Bett, Liegeplatz) |
| `marketplace_animal_snack` | Tier-Snack (Leckerli, Kauartikel) |
| `marketplace_animal_toilet` | Tier-Toilette (Katzenklo) |
| `marketplace_animal_toilet_spare_part_equipment` | Tier-Toiletten-Ersatzteil (Schaufel) |
| `marketplace_animal_toy_activity_training` | Tier-Spielzeug, Aktivität & Training |
| `marketplace_animal_transport_aid` | Tier-Transporthilfe (Box, Trage) |

### 3.2 Artspezifisch / Umgebung

| Code | Deutscher Label |
|---|---|
| `marketplace_base_substrate` | Bodengrund (Terrarium/Aquarium) |
| `marketplace_cat_litter` | Katzenstreu |
| `marketplace_cleaning_accessory` | Reinigungszubehör |
| `marketplace_cleanser` | Reiniger |
| `marketplace_lighting_heat_lamp` | Beleuchtung & Wärmelampe (Reptilien/Aquarium) |
| `marketplace_pesticides` | Pestizide |
| `marketplace_riding_accessories` | Reit-Zubehör |
| `marketplace_small_animal_housing_bath_sandpit` | Kleintier-Behausung & Sandbad |
| `marketplace_technic_technical_accessory` | Technik & technisches Zubehör |
| `marketplace_veterinary_medical_equipment` | Tiermedizinische Ausrüstung |
| `marketplace_water_care` | Wasserpflege (Aquarium) |

### 3.3 Allgemein

| Code | Deutscher Label |
|---|---|
| `marketplace_accessoires` | Accessoires |
| `marketplace_books_media` | Bücher & Medien |
| `marketplace_car_supply` | Auto-Zubehör |
| `marketplace_other_supply` | Sonstiges Zubehör |
| `marketplace_set` | Set (Bundle) |

### 3.4 Deprecated WGR-Codes → marketplace_*

Die folgende Mapping-Tabelle ist in [fressnapfCategories.ts:71](src/shared/lib/crossListing/fressnapfCategories.ts#L71)
hinterlegt. Legacy-Codes aus der xlsx werden automatisch umgeschrieben:

| WGR (Alt) | marketplace_* (Neu) | Beschreibung |
|---|---|---|
| `201001` | `marketplace_animal_sleeping_place` | KNF Liegeplatz |
| `201002` | `marketplace_animal_scratch_accessory` | KNF Kratzbäume |
| `201003` | `marketplace_animal_scratch_accessory` | KNF Kratzbretter/-pappen |
| `201005` | `marketplace_animal_housing` | KNF Möbel (Höhlen/Lodges) |
| `201011` | `marketplace_animal_toy_activity_training` | KNF Spielzeug |
| `201020` | `marketplace_animal_harness_collar_muzzle` | KNF HB/Leine/Geschirr |
| `201044` | `marketplace_animal_care_product` | KNF Pflege |
| `201055` | `marketplace_animal_feeding_drink_dispenser` | KNF Näpfe |
| `201070` | `marketplace_cat_litter` | KNF Streu |
| `201071` | `marketplace_animal_toilet` | KNF Toiletten |
| `201072` | `marketplace_animal_toilet_spare_part_equipment` | KNF Toilettenzubehör |
| `201073` | `marketplace_animal_flap_door` | KNF Klappen & Netze |
| `202001` | `marketplace_animal_sleeping_place` | HNF Liegeplatz |
| `202002` | `marketplace_animal_housing` | HNF Hundehütten |
| `202011` | `marketplace_animal_toy_activity_training` | HNF Spielzeuge |
| `202021/22` | `marketplace_animal_harness_collar_muzzle` | HNF Nylon/Leder |
| `202024` | `marketplace_animal_leash` | HNF Rollleine |
| `202041` | `marketplace_animal_care_aid` | HNF Bürsten |
| `202048` | `marketplace_animal_care_product` | HNF Pflege |
| `202055` | `marketplace_animal_feeding_drink_dispenser` | HNF Näpfe |
| `202060` | `marketplace_animal_clothing` | HNF Bekleidung |
| `202063` | `marketplace_accessoires` | HNF Acc. Sicherheit |
| `202082` | `marketplace_animal_transport_aid` | HNF Transport |
| `101001–101003, 102001–102003, 102011` | `marketplace_animal_food` / `_snack` | Futter |
| `102004` | `marketplace_animal_nutritional_supplement` | Ergänzung |

## 4. Attribut-Codes (zentrale Referenz)

### 4.1 `animal_categories` — **KRITISCH, LIST_MULTIPLE_VALUES**

Pflicht für **alle `marketplace_animal_*`-Hierarchien**. Ohne diesen Wert wird der
Upload abgelehnt. Erlaubte Werte aus `/api/values_lists?values_list=animal_categories`:

| Value-Code | Bedeutung |
|---|---|
| `cat` | Katze |
| `dog` | Hund |
| `bird` | Vogel |
| `aquarium_fish` | Aquarienfisch |
| `small_animal` | Kleintier (Kaninchen, Hamster, Meerschwein, Nager) |
| `horse` | Pferd |
| `reptile` | Reptil (Schlange, Echse, Schildkröte) |

**Mehrfach-Werte** werden durch `|` getrennt (Mirakl-Standard):
`cat|dog` = für Katzen & Hunde.

Automatische Detection aus Titel/Beschreibung:
[fressnapfCategories.ts:188](src/shared/lib/crossListing/fressnapfCategories.ts#L188) → `detectFressnapfAnimalCategory()`.

### 4.2 Weitere Pflicht-Attribute (je nach Hierarchie)

| Code | Typ | Pflicht für | Beispiel |
|---|---|---|---|
| `brand` | TEXT | alle | `Nobby`, `Trixie`, `Royal Canin` |
| `ean` | TEXT (13) | alle | `4006438012345` |
| `product_name` | TEXT | alle | Titel des Produkts |
| `material` | LIST | Behausung, Spielzeug, Kratzzubehör | `Sisal`, `Holz`, `Plüsch`, `Nylon` |
| `color` | LIST | Behausung, Bekleidung, Leine | `Schwarz`, `Beige`, `Braun` |
| `size` | LIST | Bekleidung, Geschirr, Behausung | `XS`, `S`, `M`, `L`, `XL` |
| `target_weight_min` / `target_weight_max` | NUMBER | Geschirr, Klappen | kg-Werte (Ziel-Tiergewicht) |
| `age_suitability` | LIST | Futter, Snack | `puppy`, `junior`, `adult`, `senior` |
| `weight_content` | NUMBER | Futter, Snack, Streu | in kg oder Liter |
| `unit_of_content` | LIST | Futter, Snack | `kg`, `g`, `l`, `ml` |
| `ingredients` | TEXT | Futter, Snack, Ergänzung | Zutatenliste |
| `feeding_recommendation` | TEXT | Futter | Fütterungsempfehlung |
| `grain_free` | BOOLEAN | Futter | `true`/`false` |
| `wet_or_dry` | LIST | Futter | `wet`, `dry`, `semi_moist` |
| `breed_size` | LIST | Geschirr, Klappen, Bett | `mini`, `small`, `medium`, `large` |

### 4.3 Logistik-/Compliance-Attribute

| Code | Typ | Bedeutung |
|---|---|---|
| `country_of_origin` | LIST | ISO-2 Länder-Code (z. B. `DE`, `CN`) |
| `manufacturer` | TEXT | Vollständige Hersteller-Anschrift (EU-VO 2019/1020) |
| `batch_number_required` | BOOLEAN | für Futter-Kategorien |
| `best_before_required` | BOOLEAN | für Futter-Kategorien |

## 5. Titel (max. 200 Zeichen)

- **Format**: `[Marke] [Produktart] für [Tierart], [Größe/Variante]`
- **Tierart immer erwähnen** (primäre SEO-Achse).
- Sprache: **Deutsch**, keine Anglizismen wo vermeidbar.
- Keine Emojis, keine Caps-Lock, keine Verkaufs-Claims („Nr. 1", „BESTER").

**Beispiele**:
- ✅ `PLATSCHEN Safari-Lodge für Katzen, Beige, 40 × 40 × 50 cm`
- ❌ `🐱 BESTE Kratzlodge!!! Top-Deal` (Emoji, Claim, fehlende Struktur)

## 6. Beschreibung (max. 4 000 Zeichen)

- **Einleitung**: Wer profitiert? („Ideal für aktive Welpen ab 3 Monaten")
- **Produktmerkmale** mit Tier-Nutzen verbinden (nicht nur Feature, auch Benefit).
- Pflege-/Fütterungshinweise, falls relevant.
- Erlaubte HTML-Tags (Mirakl-Standard, konservativ): `<ul>, <li>, <br>, <p>, <strong>`.
- Keine Produkt-IDs, keine externen Links, keine E-Mail-Adressen.
- Keine Konkurrenzmarken-Vergleiche.

## 7. Bild-Anforderungen

| Anforderung | Wert |
|---|---|
| Mindestens | 1 Bild |
| Maximal | 10 Bilder |
| Mindestauflösung | **1 000 × 1 000 px** |
| Hauptbild | Freisteller, weißer Hintergrund |
| Folgebilder | **Lifestyle mit Tier bevorzugt** (stärkeres Engagement) |
| Format | JPG, PNG |
| URLs | öffentlich erreichbar, kein Auth, kein Referrer-Check |

## 8. Offer-CSV (OF01) — Preis/Bestand

Der PM01-Upload enthält **keine Preise/Bestände**. Diese kommen separat.

### Pflichtfelder

| Feld | Bedeutung | Beispiel |
|---|---|---|
| `Offer SKU` | interne SKU | `PLSP-003BK` |
| `Product ID` | Produkt-Referenz | `4006438012345` |
| `Product ID Type` | `EAN`, `SKU` oder `SHOP_SKU` | `EAN` |
| `Offer Price` | Verkaufspreis (Brutto, inkl. MwSt.) | `49.99` |
| `Offer Quantity` | Lagerbestand | `25` |
| `Offer State` | Zustand | `NEW` |
| `Strike-Price-Type` | UVP-Typ | `recommended-retail-price` |
| `Strike-Price` | UVP-Wert | `69.99` |
| `Leadtime to ship` | Vorlaufzeit (Tage) | `1` |
| `Logistic Class` | Versandklasse (operator-spezifisch) | `STD_DE` |

## 9. Rejection-Codes (Error-Report)

Bei `VALIDATION_ERROR` liefert `/api/products/imports/{id}/error_report` eine CSV
mit SKU, Spalte, Code und Message. Häufigste Codes:

| Code | Bedeutung | Lösung |
|---|---|---|
| `1001` | Kategorie unbekannt | **marketplace_*-Code aus §3 verwenden** (nicht WGR!) |
| `1002` | Pflicht-Attribut fehlt | Error-Report-Zeile nennt das Attribut — füllen |
| `1003` | Attribut-Wert nicht in Values-List | `/api/values_lists?values_list=<attr>` prüfen |
| `1004` | EAN-Duplikat | anderen EAN-Typ oder Shop-SKU nutzen |
| `1005` | Bild-URL nicht erreichbar | öffentlich hosten, HEAD-Test vorab |
| `1006` | Titel > 200 Zeichen | kappen |
| `1007` | Beschreibung > 4 000 Zeichen | kürzen |
| `120065/120076/120086` | Category-Reject-Batch | siehe §3 — marketplace_*-Code erzwingen |

### Debug-Workflow

1. Error-Report laden: `GET /api/products/imports/{id}/error_report`
2. Debug-Endpoint abfragen: [/api/fressnapf/categories-debug](src/app/api/fressnapf/categories-debug/route.ts)
3. Values-List für das bemängelte Attribut holen:
   `GET /api/values_lists?values_list=<code>` via
   [/api/fressnapf/categories-debug?path=/api/values_lists?values_list=animal_categories](src/app/api/fressnapf/categories-debug/route.ts)

## 10. Varianten

Fressnapf behandelt Farbvarianten als **eigenständige Produkte** (anders als
MMS mit VGC). Konvention: EAN je Variante, identischer Titel mit variantem Suffix.

- `PLSP-003BK` (EAN 1) → Titel „… Safari-Lodge Schwarz"
- `PLSP-003WH` (EAN 2) → Titel „… Safari-Lodge Weiß"
- `PLSP-003BGE` (EAN 3) → Titel „… Safari-Lodge Beige"

## 11. Order-Workflow

```
PENDING_ACCEPTANCE   → Seller akzeptiert (i.d.R. automatisch)
WAITING_DEBIT        → Fressnapf bucht Kunden-Zahlung
SHIPPING             → Seller versendet + Tracking hochladen
SHIPPED              → Sendung unterwegs
RECEIVED             → Kunde hat erhalten
CLOSED               → Finalisiert, Payout einrechenbar
REFUSED / CANCELED   → Abbruch
```

- **Versand-SLA**: ≤ 48 h nach `SHIPPING`-State Tracking-Daten hochladen
- **Rückgabe**: 14 Tage gesetzliches Widerrufsrecht + Fressnapf-30-Tage-Garantie

## 12. SEO-Hinweise

- **Tierart-spezifische Begriffe** einflechten (z. B. „Nassfutter Katze sensitive")
- Pflege-/Ernährungs-Keywords verstärken Beratungscharakter
- Marke + Produktart + Tierart in den ersten 70 Zeichen (Google-Snippet)

## 13. Verbotene Claims

- **Medizinische Heilversprechen** ohne Zulassung (Tiermedizin-Recht, AMG)
- **Futtermittelgesetz** (FMG): Nährstoffangaben müssen belegbar sein
- Keine negativen Konkurrenz-Vergleiche
- Keine Grünen Claims ohne Zertifikat (EU Green-Claim-Directive)
- Keine „100 % natürlich"-Claims ohne Beleg

## 14. Mirakl-API-Endpunkte (Fressnapf)

Basis: `https://fressnapfde-prod.mirakl.net`

| Pfad | Zweck |
|---|---|
| `POST /api/products/imports` | PM01-Upload |
| `POST /api/offers/imports` | OF01-Upload |
| `GET /api/products/imports/{id}` | Status-Poll |
| `GET /api/products/imports/{id}/error_report` | Rejection-CSV |
| `GET /api/hierarchies` | Kategorie-Baum (marketplace_*-Codes) |
| `GET /api/products/attributes` | alle Attribute mit Typ/Required |
| `GET /api/values_lists` | erlaubte Werte für LIST-Attribute |
| `GET /api/orders` | Order-Fetch |
| `PUT /api/orders/{id}/tracking` | Tracking-Upload |
| `PUT /api/orders/{id}/ship` | Versand-Status |

Auth: Header `Authorization: <apiKey>` (nicht `Bearer`).

Debug-Wrapper: [/api/fressnapf/categories-debug](src/app/api/fressnapf/categories-debug/route.ts) —
probt mehrere Pfade und liefert JSON-Response direkt.

## 15. Mapping-Cheatsheet (unsere Domäne → Fressnapf)

| Unser Feld (Master-DB) | Fressnapf/Mirakl |
|---|---|
| `title` | `product_name` (max 200 Z.) |
| `description` | `description` (max 4 000 Z., erlaubt: ul/li/br/p/strong) |
| `brand` | `brand` |
| `ean` | `ean` (13-stellig) bzw. `Product ID` (Offer) |
| `category_path` (DE) | **resolveFressnapfCategoryCode()** → `category` (marketplace_*) |
| `animal_species` (einzeln) | `animal_categories` — via `detectFressnapfAnimalCategory()` |
| `material_primary` | `material` |
| `color_normalized` | `color` |
| `size` | `size` |
| `age_group` | `age_suitability` |
| `weight_g` / `content_ml` | `weight_content` + `unit_of_content` |
| `ingredients_text` | `ingredients` (für Futter) |
| `target_animal_weight_min_kg` / `_max_kg` | `target_weight_min` / `_max` |
| `country_of_origin_iso2` | `country_of_origin` |
| `manufacturer_address` | `manufacturer` |
| `image_primary_url` | erste Bild-URL (Position 1) |
| `image_urls[1..9]` | Position 2–10 |
| `price_eur` | `Offer Price` |
| `stock_quantity` | `Offer Quantity` |
| `rrp_eur` | `Strike-Price` (`Type=recommended-retail-price`) |
| `lead_days` | `Leadtime to ship` |

## 16. Fehler-Präventions-Regeln (für unseren Dispatcher)

Implementiert in [submitListingDispatcher.ts](src/shared/lib/crossListing/submitListingDispatcher.ts):

1. **Category-Resolution** via `resolveFressnapfCategoryCode()` vor jedem Upload —
   akzeptiert `marketplace_*`-Codes, mappt alte WGR-Codes und heuristisch
   deutsche Labels (z. B. „Kratzmöbel" → `marketplace_animal_housing`).
2. **`animal_categories`-Spalte automatisch anhängen**, wenn die Hierarchie
   `marketplace_animal_*` ist und Tierart detektierbar.
3. **Titel auf 200 Z. kappen** (slug `fressnapf`).
4. **Beschreibung auf 4 000 Z. kappen**, HTML whitelist-stripen.
5. **Bilder**: HEAD-Check + 1 000×1 000-Minimum vor dem Upload.
6. **EAN-Validierung**: 13-stellig + Prüfziffer.

## 17. Referenz-Links

- Seller-Portal: <https://fressnapfde-prod.mirakl.net/mmp/shop/home>
- Mirakl Help (Seller): <https://help.mirakl.com/bundle/sellers>
- Operator Template: <https://help.mirakl.com/bundle/sellers/page/topics/Mirakl/mmp/Seller/sellers_doc/seller_onboarding/product_offer_upload_using_operator_template.html>
- Fressnapf Partner-Portal: <https://partner.fressnapf.de/>
- Mirakl API Docs: <https://help.mirakl.com/bundle/sellers/page/topics/Mirakl/api/api_overview.html>
- Interner Debug-Endpoint: [src/app/api/fressnapf/categories-debug/route.ts](src/app/api/fressnapf/categories-debug/route.ts)
- Interne Kategorie-Map: [src/shared/lib/crossListing/fressnapfCategories.ts](src/shared/lib/crossListing/fressnapfCategories.ts)
