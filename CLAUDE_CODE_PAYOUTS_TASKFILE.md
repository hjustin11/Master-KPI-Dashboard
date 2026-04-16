# Payouts V2 — Arbeitsauftrag für Claude Code

**Lies diese Datei VOLLSTÄNDIG bevor du anfängst.**

Diese Datei enthält 6 Prompts (PROMPT 0 bis PROMPT 5). Arbeite sie **STRIKT in dieser Reihenfolge** ab. Nach jedem Prompt STOPPST du, machst Build + Test, und wartest auf den User bevor du den nächsten startest.

**Ziel am Ende:** Die `/analytics/payouts` Seite sieht aus wie `/mnt/user-data/uploads/vergleichsbericht.html` — mit echten Daten, korrekten Vergleichen, Day-by-Day-Chart, Detail-Tabelle, Produkt-Performance, Findings und Handlungsempfehlungen.

---

## Arbeits-Regeln (IMMER EINHALTEN)

1. **Ein Prompt = eine Session.** Wenn PROMPT 1 fertig ist: STOPP. Nicht zu PROMPT 2 weitergehen ohne User-Freigabe.
2. **Nach JEDEM Prompt:** `npm run typecheck && npm run lint && npm run build`. Wenn einer fehlschlägt: NICHT weitergehen, Fehler an User melden.
3. **Keine Zusatz-Features.** Wenn du während PROMPT 2 eine Idee hast für PROMPT 4: notiere sie in einem TODO.md, mach sie nicht jetzt.
4. **Dev-Server neu starten** nach strukturellen Änderungen (neue Route, neue DB-Query).
5. **Status-Report am Ende jedes Prompts:** Schreib dem User genau: "FERTIG PROMPT X — Test bitte: [konkrete Test-Anweisung mit URL und erwartetem Ergebnis]"
6. **Wenn du einen Blocker findest** (z.B. Migration fehlt, DB-Spalte fehlt): STOPP. Frag den User. Mach nicht einfach weiter.
7. **Der HTML-Bericht ist die Vision:** Lies `/mnt/user-data/uploads/vergleichsbericht.html` VOR PROMPT 0 einmal komplett. Das ist das optische und strukturelle Ziel.

---

## Projektkontext

**Stack:** Next.js 16.2.1, React 19, TypeScript strict, Tailwind 4, Supabase PRO, Zustand 5, TanStack Query 5, shadcn/ui, Chart.js (oder Recharts — prüfen was schon da ist).

**Relevante Dateien (aktueller Stand, vor deinen Änderungen):**
- `src/app/(dashboard)/analytics/payouts/page.tsx` — Payouts-Seite
- `src/app/api/payouts/overview/route.ts` — Aggregator-API
- `src/app/api/payouts/amazon/sync/route.ts` — Amazon-Sync
- `src/app/api/payouts/mirakl/sync/route.ts` — Mirakl-Sync
- `src/app/api/payouts/shopify/sync/route.ts` — Shopify-Sync
- `src/shared/hooks/usePayoutsLoader.ts` — Client-Loader
- `src/shared/lib/payouts/` — alle Payout-Services
- `supabase/migrations/20260504000000_marketplace_payouts.sql` — Tabelle

**User-Upload zur Referenz:**
- `/mnt/user-data/uploads/vergleichsbericht.html` — die Ziel-Vision, enthält:
  - Side-by-Side Periode-Header mit beiden Auszahlungen
  - 8 KPI-Compare-Karten (Current + Previous + Delta)
  - Day-by-Day Line Chart (beide Perioden übereinander)
  - Detail-Tabelle in 5 Sektionen mit Delta-Pills
  - Side-by-Side Bar Charts
  - Produkt-Performance-Tabelle (Verlierer rot, Gewinner grün)
  - 4-5 auto-generierte Findings
  - 4 Handlungsempfehlungen in 2x2-Grid

**Bekannte Baustellen vor PROMPT 0:**
- Vorperiode und Aktuelle Periode zeigen IDENTISCHE Werte (Aggregator-Bug)
- Nur Amazon sichtbar obwohl Mirakl/Shopify gesynct wurden
- Dropdown-Labels sind englisch ("current", "previous", "lastMonth")
- Design ist karg (6 flache KPI-Karten, ein Waterfall-Chart, flat Marktplatz-Tabelle)
- Ein Amazon-Settlement scheitert mit "numeric field overflow" (ID 182451020558)

---

# PROMPT 0 — Foundation-Fix: Periode-Logik

**Einzige Aufgabe dieser Session:** Der Periode-Vergleich auf der Payouts-Seite ist kaputt. Vorperiode und Aktuelle Periode zeigen identische Werte. Diesen einen Bug fixen, sonst nichts.

## Vorgehen

**SCHRITT 1 — Lesen:**
Lies die Datei `src/app/api/payouts/overview/route.ts`. Zeige dem User in deiner Antwort den RELEVANTEN CODE-BLOCK wo die Query gebaut wird. Markiere wo `period_start_date / period_end_date / from / to` verarbeitet wird.

**SCHRITT 2 — Lesen:**
Lies alle Services die von route.ts importiert werden (z.B. `payoutsAggregator`, `getPayoutsOverview`). Zeige dem User den Code.

**SCHRITT 3 — Diagnostizieren:**
Erkläre dem User in 3 Sätzen was der Bug ist. Keine Spekulation — basierend auf dem gelesenen Code.

**SCHRITT 4 — Fixen:**
Minimalen Fix machen. Die Aggregator-Query muss zwei separate Queries ausführen:
- Current Period: `WHERE period_start_date >= $fromCurrent AND period_end_date <= $toCurrent`
- Previous Period: `WHERE period_start_date >= $fromPrevious AND period_end_date <= $toPrevious`
- Previous-Range wird berechnet: gleiche Länge wie Current, direkt davor.

Response-Shape muss sein:
```typescript
{
  current: {
    range: { from: string, to: string, label: string },
    totals: { grossSales, fees, ads, returns, net, orders, returnCount, payoutRate, returnRate, tacos, aov },
    marketplaces: [{ slug, name, grossSales, fees, ads, returns, net, payoutRate, orders }, ...]
  },
  previous: { /* gleiche Struktur */ },
  deltas: { grossSales, net, orders, payoutRate, ... } // pro KPI
}
```

**SCHRITT 5 — Bonus-Fix: "numeric field overflow":**
Im Log steht:
```
Upsert 182451020558: numeric field overflow 
gross=21.99 refunds=319.99 fees=3.93 fulfillment=8.31 ads=0 shipping=0 
promos=0 other=0.12 reserve=0 net=-246.15 orders=1 returns=1 units=1
```
Keine dieser Zahlen overflowed NUMERIC(12,2). Der Bug liegt in einem anderen Feld das nicht geloggt wird. 

Todo:
- Erweitere den Error-Log in `amazonSettlementFetch.ts` (oder wo der Upsert passiert) um ALLE Felder des Upsert-Payloads auszugeben (period_start_date, period_end_date, marketplace_slug, raw_data, alle numerischen Felder).
- Wenn nach dem Re-Sync klar ist welches Feld overflowed: fixe es entweder durch Spalten-Erweiterung (Migration) oder durch Parser-Fix.

**SCHRITT 6 — Build-Check:**
```
npm run typecheck
npm run lint
npm run build
```
Alle drei müssen grün sein.

**SCHRITT 7 — Status-Report:**
Schreibe dem User:
```
FERTIG PROMPT 0 — Test bitte:
1. Gehe zu /analytics/payouts
2. Wähle Zeitraum "Letzte 14 Tage" (oder current default)
3. Prüfe: Aktuelle Periode und Vorperiode zeigen UNTERSCHIEDLICHE Werte
4. Prüfe: Marktplatz-Tabelle zeigt alle Marktplätze mit Daten (nicht nur Amazon)
5. Klicke "Alle synchronisieren"
6. Prüfe: Settlement 182451020558 wird erfolgreich gespeichert ODER der neue Log-Output zeigt welches Feld overflowed
```

## NICHT TUN in PROMPT 0
- Keine neuen UI-Komponenten
- Keine Charts ändern
- Keine Findings-Logik
- Keine Produkt-Performance
- Nur der Aggregator-Bug und der Settlement-Debug-Log

---

# PROMPT 1 — Periode-Presets + i18n-Cleanup

**Nach PROMPT 0 + User-Freigabe.**

**Aufgabe:** Das Dropdown zeigt englische Labels ("current", "previous", "lastMonth"). Ersetze durch deutsche Presets mit korrekter Perioden-Berechnung.

## Vorgehen

**SCHRITT 1 — Neue Datei erstellen:**
`src/shared/lib/payouts/periodResolver.ts`

```typescript
export type PeriodPreset = 
  | "last_14_days" 
  | "last_30_days" 
  | "last_settlement" 
  | "last_month" 
  | "last_quarter" 
  | "year_to_date" 
  | "custom";

export type PeriodRange = { from: string; to: string; label: string };
export type ResolvedPeriods = { current: PeriodRange; previous: PeriodRange };

export function resolvePeriods(
  preset: PeriodPreset, 
  customRange?: { from: string; to: string }
): ResolvedPeriods {
  // Für jeden Preset:
  // 1. Current-Range berechnen (basiert auf heute)
  // 2. Previous-Range = exakt gleiche Länge, direkt davor
  //
  // Beispiele:
  // last_14_days: 
  //   current = heute-13 bis heute (14 Tage)
  //   previous = heute-27 bis heute-14
  //
  // last_30_days: analog, 30 Tage
  //
  // last_month: 
  //   current = erster bis letzter Tag des Vormonats
  //   previous = erster bis letzter Tag des Vor-Vormonats
  //
  // last_settlement: 
  //   current = jüngster Settlement-Zyklus aus marketplace_payouts (Amazon)
  //   previous = der davor liegende
  //
  // last_quarter: 
  //   current = letzte 3 vollständige Monate
  //   previous = 3 Monate davor
  //
  // year_to_date:
  //   current = 1. Januar bis heute
  //   previous = 1. Januar bis heute-X-Tage des Vorjahres (gleiche Tage-Anzahl)
  //
  // custom:
  //   current = customRange.from bis customRange.to
  //   previous = gleiche Länge davor
}
```

Tests schreiben in `src/shared/lib/payouts/__tests__/periodResolver.test.ts`:
- last_14_days: heute 2026-04-16 → current 2026-04-03 bis 2026-04-16, previous 2026-03-20 bis 2026-04-02
- last_month: heute 2026-04-16 → current 2026-03-01 bis 2026-03-31, previous 2026-02-01 bis 2026-02-28
- custom 2026-04-01 bis 2026-04-15 → previous 2026-03-17 bis 2026-03-31
- Alle deutschen Labels korrekt

**SCHRITT 2 — Neue UI-Komponente:**
`src/app/(dashboard)/analytics/payouts/components/PayoutsPeriodSelector.tsx`

Ersetzt das bisherige Dropdown. Zeigt:
- Preset-Select mit deutschen Labels:
  - "Letzte 14 Tage"
  - "Letzte 30 Tage"
  - "Letzter Settlement-Zyklus"
  - "Letzter Monat"
  - "Letztes Quartal"
  - "Jahr bis heute"
  - "Benutzerdefiniert..."
- Bei "Benutzerdefiniert": DatePicker für Current-Range from/to
- Anzeige unterhalb: "Vergleich mit: 17.03.–31.03.2026 (Vorperiode)"

**SCHRITT 3 — Aggregator anpassen:**
`src/app/api/payouts/overview/route.ts` akzeptiert neue Query-Params:
- `preset=last_14_days` (Standard)
- `from` + `to` nur bei `preset=custom`

Default bei keinem Preset: `last_14_days`.

**SCHRITT 4 — i18n:**
Alle Strings in de/en/zh übersetzen. Konkret:
- "current" / "previous" / "lastMonth" → komplett entfernen
- Neue Keys: `payouts.preset.last14Days`, `payouts.preset.last30Days`, etc.
- "Vergleich mit Vorperiode" bleibt

**SCHRITT 5 — Build:**
typecheck + lint + test + build. Alle vier grün.

**SCHRITT 6 — Report:**
```
FERTIG PROMPT 1 — Test bitte:
1. Gehe zu /analytics/payouts
2. Dropdown zeigt "Letzte 14 Tage" (Standard, deutsch)
3. Wechsle zu "Letzter Monat"
4. Prüfe: Anzeige "Vergleich mit: [korrekter Vormonat]"
5. Wechsle zu "Benutzerdefiniert" + wähle Range
6. Prüfe: Previous-Range wird korrekt berechnet
```

## NICHT TUN in PROMPT 1
- Keine neuen KPI-Karten
- Keine Charts
- Nur das Dropdown + periodResolver

---

# PROMPT 2 — Header + KPI-Compare-Grid + Marktplatz-Tabelle

**Nach PROMPT 1 + User-Freigabe.**

**Aufgabe:** Die aktuellen 6 flachen KPI-Karten ersetzen durch ein Side-by-Side-Layout wie in `vergleichsbericht.html`. 8 KPI-Karten mit Current/Previous/Delta. Header mit Side-by-Side-Periode-Box. Marktplatz-Tabelle zeigt ALLE Marktplätze mit Vergleichs-Deltas.

## Referenz

Aus `/mnt/user-data/uploads/vergleichsbericht.html`:
- Zeilen 170–195: Header mit Side-by-Side-Periode-Box (dunkler Gradient, orange Akzent)
- Zeilen 200–265: KPI-Compare-Grid mit 8 Karten

## Vorgehen

**SCHRITT 1 — PayoutsHeaderV2.tsx:**
Neue Komponente `src/app/(dashboard)/analytics/payouts/components/PayoutsHeaderV2.tsx`.

Layout wie Screenshot aus HTML:
```
┌─────────────────────────────────────────────────────────────┐
│  Auszahlungen & Rentabilität          [Preset ▼] [Sync]     │
│  Amazon Auszahlungs-Vergleich (orange)                      │
│  [N] Tage · [M] Abrechnungszeiträume                        │
│                                                             │
│  ┌─────────────────┐      ┌─────────────────┐               │
│  │ VORPERIODE      │  →   │ AKTUELLE PERIODE│               │
│  │ 17.03.–31.03.   │      │ 31.03.–14.04.   │               │
│  │ 19.617,62 €     │      │ 9.835,92 €      │               │
│  └─────────────────┘      └─────────────────┘               │
│                                                             │
│  ▼ Auszahlung um 49,9 % eingebrochen — Gründe unten         │
└─────────────────────────────────────────────────────────────┘
```

- Titel links, Preset-Selector + Sync-Button rechts
- Dunkler Gradient `linear-gradient(135deg, #232f3e 0%, #37475a 100%)`
- Subtitle in orange (`#ff9900`) uppercase
- Side-by-Side Box mit 3-Spalten-Grid (Vorperiode | Pfeil | Aktuell)
- Hero-Alert unten wenn |Delta| > 20%: rot bei negativ, grün bei positiv

**SCHRITT 2 — PayoutsKpiCompareGrid.tsx:**
Neue Komponente, ersetzt die 6 bisherigen flachen KPI-Karten.

8 Karten in 4-Spalten-Grid auf Desktop, 2 auf Tablet, 1 auf Mobile:

| # | KPI | Format | Hoch = Gut? |
|---|-----|--------|-------------|
| 1 | Auszahlung (€) | Euro | ✅ |
| 2 | Bruttoumsatz (€) | Euro | ✅ |
| 3 | Bestellungen (#) | Integer | ✅ |
| 4 | Ø Bestellwert (€) | Euro | ✅ |
| 5 | Retouren (€) | Euro | ❌ |
| 6 | Werbekosten (€) | Euro | neutral |
| 7 | TACOS (%) | Prozent | ❌ |
| 8 | Auszahlungsquote (%) | Prozent | ✅ |

Jede Karte:
```
┌─────────────────────┐
│ AUSZAHLUNG          │ ← Label klein, grau, uppercase
│ 9.835,92 €          │ ← Current groß, fett
│ 19.617,62 €         │ ← Previous klein, grau
│ ▼ −49,9 %           │ ← Delta-Pill mit Icon+Farbe
└─────────────────────┘
```

Delta-Farben:
- Grün wenn Veränderung im positiven Sinn (abhängig von "hoch=gut")
- Rot wenn Veränderung im negativen Sinn
- Grau bei stable (|Δ| < 2%)

Linker Rand-Balken der Karte farbig: rot (down), grün (up), grau (stable).

**SCHRITT 3 — PayoutsMarketplaceTable erweitern:**
Die bestehende Tabelle zeigt nur Amazon. Sie soll ALLE Marktplätze aus dem Aggregator-Response zeigen.

Spalten: Marktplatz | Brutto (Curr) | Brutto (Prev) | Δ | Gebühren | Werbung | Retouren | Netto | Netto (Prev) | Δ | Quote | Quote (Prev)

- Marktplatz-Logo neben Name (aus `public/brand/marketplaces/[slug].svg`)
- Wenn Logo fehlt (404): graues Platzhalter-Icon
- Bei leeren Daten (noch nie gesynct): Zeile grau mit Hinweis "Sync nicht eingerichtet"
- Summenzeile unten: Gesamt über alle Marktplätze

**SCHRITT 4 — Amazon-Logo ergänzen:**
`public/brand/marketplaces/amazon.svg` fehlt (404 im Log). Ergänze eine SVG im Stil der anderen Marktplatz-Logos.

**SCHRITT 5 — Alte Komponenten entfernen:**
- Die flachen 6 KPI-Karten aus `page.tsx` raus
- Den alten Waterfall-Chart raus (kommt später in anderem Form zurück)
- Den alten Header raus (ersetzt durch PayoutsHeaderV2)

**SCHRITT 6 — Build:**
typecheck + lint + test + build. Alle grün.

**SCHRITT 7 — Report:**
```
FERTIG PROMPT 2 — Test bitte:
1. Gehe zu /analytics/payouts
2. Header zeigt dunklen Gradient mit Side-by-Side Periode-Box
3. 8 KPI-Karten in Grid mit Current+Previous+Delta-Pill
4. Marktplatz-Tabelle zeigt alle verfügbaren Marktplätze mit Logos
5. Amazon-Logo ist jetzt sichtbar (nicht mehr 404)
6. Bei starkem Delta: Hero-Alert unter Header
```

## NICHT TUN in PROMPT 2
- Keine Charts
- Keine Produkt-Performance
- Keine Findings
- Nur Header + KPI-Grid + Marktplatz-Tabelle + Amazon-Logo

---

# PROMPT 3 — Day-by-Day Chart + Detail-Compare-Tabelle

**Nach PROMPT 2 + User-Freigabe.**

**Aufgabe:** Zwei zentrale Visualisierungen aus dem HTML-Bericht umsetzen:
1. Day-by-Day Line Chart mit beiden Perioden übereinander
2. Detail-Compare-Tabelle mit 5 Sektionen (Einnahmen, Retouren, Gebühren, Werbung, Auszahlung)

## Referenz

Aus `/mnt/user-data/uploads/vergleichsbericht.html`:
- Zeilen 270–280 + 555–600: Day-by-Day Line Chart (Chart.js)
- Zeilen 282–375: Detail-Vergleichstabelle mit Sektionen

## Vorgehen

**SCHRITT 1 — Backend: dailyBreakdown Service:**
`src/shared/lib/payouts/dailyBreakdown.ts` neu erstellen.

```typescript
export async function getDailyBreakdown(
  supabase: SupabaseClient,
  marketplaceSlug: string,
  range: { from: string; to: string }
): Promise<Array<{ date: string; grossSales: number; orders: number }>> {
  // Query-Strategie:
  // 1. Prüfe ob settlement_line_items Tabelle existiert
  // 2. Falls ja: aggregiere nach posted_date
  // 3. Falls nein: fallback auf amazon_orders/xentral_deliveries 
  //    oder splitte Settlement-Summen gleichmäßig auf Tage
  //
  // Return: Array mit genau N Einträgen für N Tage im Range
  // (fehlende Tage mit grossSales=0, orders=0)
}
```

Falls `settlement_line_items` fehlt: Migration erstellen ODER vorerst die Settlement-Werte gleichmäßig auf die Tage der Settlement-Periode verteilen (dokumentieren als "geschätzt, bis line-item-level Sync eingerichtet ist").

**SCHRITT 2 — Aggregator erweitern:**
`/api/payouts/overview` Response um `dailySeries` erweitern:
```typescript
current: {
  ...,
  dailySeries: Array<{ date: string; grossSales: number; orders: number }>
},
previous: {
  ...,
  dailySeries: [...]
}
```

**SCHRITT 3 — PayoutsDailyCompareChart.tsx:**
Neue Komponente mit Chart.js Line Chart.

- X-Achse: "Tag 1" bis "Tag N" (normalisiert, beide Perioden auf gleiche Länge)
- Y-Achse: Tagesumsatz in €, Format "1.234 €"
- Dataset 1: Vorperiode, Farbe `#94a3b8` (grau), `borderWidth: 2`, `tension: 0.3`, Fill mit `rgba(148,163,184,0.1)`
- Dataset 2: Aktuelle Periode, Farbe `#dc2626` (rot), `borderWidth: 2.5`, `tension: 0.3`, Fill mit `rgba(220,38,38,0.1)`
- Tooltip zeigt beide Werte im deutschen Format
- Legende oben rechts

Card-Header: "Umsatz-Entwicklung im Tagesvergleich" + Badge "Day-by-Day".

**SCHRITT 4 — PayoutsDetailCompareTable.tsx:**
Neue Komponente, Tabelle in 5 Sektionen.

Struktur:
```
┌─── Position ──────────── Vorperiode ── Aktuell ── Δ ──┐
│ EINNAHMEN (Section-Header, grau)                      │
│ Artikelpreise (Brutto)    34.142,09 €  22.070,52 € [▼-35,4%]│
│ Bestellungen              545          441         [▼-19,1%]│
│ Ø Bestellwert             62,65 €      50,05 €     [▼-20,1%]│
│                                                       │
│ RETOUREN                                              │
│ Erstattete Artikel        -1.696,38 €  -2.903,01 € [▼+71,1%]│
│ Anzahl Retouren           22           24          [▼+9,1%] │
│ Retourenquote (€)         5,0 %        13,2 %      [▼+8,2pp]│
│                                                       │
│ AMAZON-GEBÜHREN                                       │
│ Verkaufs- & FBA-Gebühren  -6.904,57 €  -4.717,54 € [▲+31,7%]│
│ Rabatte / Coupons         -1.669,38 €  -497,09 €   [▲+70,2%]│
│ Service-Gebühren gesamt   -4.897,36 €  -4.740,99 € [▬-3,2%] │
│                                                       │
│ WERBUNG                                               │
│ Werbekosten (Sponsored Ads) -4.244,16 € -4.225,63 €[▬-0,4%]│
│ TACOS (Ads / Umsatz)      12,4 %       19,1 %      [▼+6,7pp]│
│                                                       │
│ → AUSZAHLUNG (dunkel, fett)                           │
│ → Auszahlung              19.617,62 €  9.835,92 €  [▼-49,9%]│
└───────────────────────────────────────────────────────┘
```

- Delta-Pills rechtsbündig, mit Pfeil-Icon + Prozent
- Prozent-Punkte für %-Werte ("pp" statt "%")
- Numerische Werte rechtsbündig
- Section-Header grau hinterlegt, uppercase, bold
- Auszahlungs-Zeile mit dunklem Hintergrund und fettem Font

Card-Header: "Detail-Vergleich: Wo ist das Geld hingegangen?" + Badge "Position-für-Position".

**SCHRITT 5 — In page.tsx integrieren:**
Ordnung auf der Seite:
1. PayoutsHeaderV2 (schon da)
2. Hero-Alert (schon da, bedingt)
3. PayoutsKpiCompareGrid (schon da)
4. PayoutsDailyCompareChart (NEU)
5. PayoutsDetailCompareTable (NEU)
6. PayoutsMarketplaceTable (schon da, erweitert)

**SCHRITT 6 — Build:**
typecheck + lint + test + build. Alle grün.

**SCHRITT 7 — Report:**
```
FERTIG PROMPT 3 — Test bitte:
1. Gehe zu /analytics/payouts
2. Unter KPI-Grid: Day-by-Day Chart mit zwei Linien
3. Chart: Tag 1 bis Tag N normalisiert, Tooltip in Deutsch
4. Unter Chart: Detail-Tabelle mit 5 Sektionen
5. Jede Zeile zeigt Current | Previous | Delta-Pill
6. Auszahlungs-Zeile unten dunkel hervorgehoben
7. Console zeigt keine Fehler
```

## NICHT TUN in PROMPT 3
- Keine Produkt-Performance
- Keine Findings
- Keine Recommendations
- Keine Export-Funktion
- Nur Day-by-Day-Chart + Detail-Tabelle

---

# PROMPT 4 — Produkt-Performance + Auto-Findings + Recommendations

**Nach PROMPT 3 + User-Freigabe.**

**Aufgabe:** Die Intelligence-Schicht dazubauen. Produkte nach Delta% sortieren, automatische Findings generieren, Handlungsempfehlungen ableiten.

## Referenz

Aus `/mnt/user-data/uploads/vergleichsbericht.html`:
- Zeilen 377–470: Produkt-Performance-Tabelle
- Zeilen 472–520: Findings (critical/warning/positive/info)
- Zeilen 525–555: Handlungsempfehlungen in 2x2-Grid

## Vorgehen

**SCHRITT 1 — productPerformance Service:**
`src/shared/lib/payouts/productPerformance.ts` neu.

```typescript
export type ProductPerformanceRow = {
  sku: string;
  name: string;
  ordersPrev: number;
  ordersCurr: number;
  revenuePrev: number;
  revenueCurr: number;
  deltaPercent: number;
  deltaEur: number;
  status: "winner" | "loser" | "stable" | "crashed" | "gone";
};

export async function getProductPerformance(
  supabase: SupabaseClient,
  marketplaceSlug: string,
  currentRange: DateRange,
  previousRange: DateRange
): Promise<ProductPerformanceRow[]> {
  // Query: Aggregate Umsatz+Bestellungen pro SKU in BEIDEN Zeiträumen
  // JOIN mit Artikelstamm für Produktnamen
  // SORT nach absolutem Delta €
  // LIMIT 15 (top gains + top losses)
  //
  // Status:
  // - "crashed" wenn deltaPercent < -50% UND revenuePrev > 500€
  // - "gone" wenn revenueCurr = 0 UND revenuePrev > 0
  // - "loser" wenn -50% < deltaPercent < -20%
  // - "stable" wenn -20% <= deltaPercent <= +10%
  // - "winner" wenn deltaPercent > +10%
}
```

Datenquelle: Entweder `settlement_line_items` (falls vorhanden) oder Amazon-Orders-Tabelle oder Xentral-Deliveries.

**SCHRITT 2 — PayoutsProductPerformance.tsx:**
Neue Komponente.

Card-Header: "🔎 Der eigentliche Grund: Top-Performer und Verlierer"
Subtitle: "Welche SKUs treiben die Auszahlung rauf oder runter?"

Tabelle mit 6 Spalten: Produkt | Best. Vor | Best. Akt. | Umsatz Vor | Umsatz Akt. | Δ %

Row-Styling je Status:
- `crashed`: Hintergrund `#fef2f2` (hell-rot), Emoji ⚠️ vor Produktname
- `gone`: Hintergrund `#fef2f2`, Emoji ⚠️, Delta "-100 %"
- `loser`: Hintergrund `#fef2f2`, normale Schriftfarbe
- `stable`: normale Zeile, Delta in orange (#f59e0b) wenn leicht negativ
- `winner`: Hintergrund `#f0fdf4` (hell-grün), Emoji ✅

Sortierung: crashed zuerst (größte Verluste oben), dann loser, dann stable, dann winner.

**SCHRITT 3 — findingsGenerator Service:**
`src/shared/lib/payouts/findingsGenerator.ts` neu.

```typescript
export type Finding = {
  id: string;
  type: "critical" | "warning" | "positive" | "info";
  title: string;
  body: string;
  impactEur?: number;
  relatedSkus?: string[];
  recommendedAction?: string;
};

export function generateFindings(
  current: OverviewPeriod,
  previous: OverviewPeriod,
  products: ProductPerformanceRow[],
  daily: DailyPoint[]
): Finding[] {
  const findings: Finding[] = [];
  
  // RULE 1 — Premium-Produkt-Crash:
  // Wenn top-3 Produkte der Vorperiode (nach Umsatz) in Summe >50% 
  // Umsatz verloren haben: CRITICAL
  // Body nennt die betroffenen SKUs und den € Verlust
  
  // RULE 2 — Retourenexplosion:
  // Wenn return_rate_eur (current) > previous + 5pp: CRITICAL
  // Body erklärt: trotz weniger Umsatz mehr Retouren in € → Produktproblem
  
  // RULE 3 — TACOS-Anstieg:
  // Wenn tacos current > previous + 3pp: WARNING
  // Body: "stiller Profitfresser — Werbebudget läuft weiter bei sinkendem Umsatz"
  
  // RULE 4 — Werbung unangepasst:
  // Wenn |Werbekosten-Delta| < 5% ABER Umsatz-Delta < -20%: WARNING
  // Body: Werbebudget muss an Umsatzniveau angepasst werden
  
  // RULE 5 — Gewinner-Produkte:
  // Wenn >= 2 Produkte mit >20% Umsatzwachstum: POSITIVE
  // Body nennt die Produkte, empfiehlt Werbebudget-Umschichtung
  
  // RULE 6 — Rabatt-Reduktion:
  // Wenn Rabatte/Coupons delta < -50%: INFO
  // Body: "Zusammenhang prüfen: Lief in der Vorperiode ein Deal/Event?"
  
  // RULE 7 — Auszahlung halbiert:
  // Wenn net-Delta < -45%: CRITICAL
  // Body fasst zusammen: "Auszahlung um X% eingebrochen — N identifizierte Ursachen"
  
  return findings.sort(byTypeSeverity);
}
```

**SCHRITT 4 — recommendationsGenerator Service:**
`src/shared/lib/payouts/recommendationsGenerator.ts` neu.

```typescript
export type Recommendation = {
  id: string;
  timeframe: "sofort" | "7days" | "2weeks" | "ongoing";
  title: string;
  description: string;
  potentialEur?: { min: number; max: number };
  linkedFindingIds: string[];
};

export function generateRecommendations(findings: Finding[]): Recommendation[] {
  // Mapping:
  // - Jedes CRITICAL Finding → "sofort"-Empfehlung 
  //   (z.B. Listing-Check, Buy-Box, Preis, Wettbewerber)
  // - Jedes WARNING Finding → "7days"-Empfehlung
  //   (z.B. Werbebudget umschichten, Ziel-TACOS festlegen)
  // - Mehrere Retouren-Findings → "2weeks"-Empfehlung 
  //   (Retourengründe in Seller Central analysieren)
  // - Positive Findings → "ongoing"-Empfehlung 
  //   (Hero-Produkte ausbauen, ACOS pflegen)
  //
  // Max 4 Empfehlungen zurückgeben, 1 pro timeframe
  // Priorisiere nach potentialEur (wenn angegeben)
}
```

**SCHRITT 5 — PayoutsFindings.tsx:**
Neue Komponente, zeigt Findings als Karten.

Je Finding:
- Type-Icon links (🚨 critical, ⚠️ warning, ✅ positive, ℹ️ info)
- Titel fett
- Body-Text mit wichtigen Werten gefettet
- Farb-Codierung:
  - critical: roter linker Balken + `bg-red-50`
  - warning: oranger Balken + `bg-orange-50`
  - positive: grüner Balken + `bg-green-50`
  - info: grauer Balken + `bg-gray-50`

Card-Header: "🔍 Warum ist die Auszahlung eingebrochen? — N Ursachen" (dynamisch je nach Finding-Anzahl)

**SCHRITT 6 — PayoutsRecommendations.tsx:**
Neue Komponente, zeigt Empfehlungen in 2x2-Grid.

Card-Container mit dunklem Gradient (`linear-gradient(135deg,#1a2332 0%, #2d3e52 100%)`), weißer Text.

Jede Empfehlung:
- Timeframe-Label oben in orange (`#ff9900`) uppercase
- Titel weiß, fett
- Description grau (`#d1d9e0`)
- Potenzial-Angabe grün (`#00ff9d`) fett

Unter dem Grid: Fazit-Box mit orange-transparent Hintergrund, fasst zusammen wie realistisch die Verbesserung ist.

Card-Header: "📈 Handlungsempfehlungen in Reihenfolge der Wirkung"

**SCHRITT 7 — Aggregator erweitern:**
`/api/payouts/overview` Response um `products`, `findings`, `recommendations` erweitern.

**SCHRITT 8 — In page.tsx einfügen:**
Finale Reihenfolge:
1. PayoutsHeaderV2
2. Hero-Alert (bedingt)
3. PayoutsKpiCompareGrid
4. PayoutsDailyCompareChart
5. PayoutsDetailCompareTable
6. PayoutsMarketplaceTable
7. **PayoutsProductPerformance (NEU)**
8. **PayoutsFindings (NEU)**
9. **PayoutsRecommendations (NEU)**
10. Footer "Erstellt am [Datum]"

**SCHRITT 9 — Build:**
typecheck + lint + test + build. Alle grün.

**SCHRITT 10 — Report:**
```
FERTIG PROMPT 4 — Test bitte:
1. /analytics/payouts zeigt vollständige Seite
2. Produkt-Tabelle: Verlierer rot, Gewinner grün, mit ⚠️/✅ Emojis
3. Findings-Karten mit farbigen Balken je nach Typ
4. Recommendations-Grid in dunklem Gradient mit 4 Zeitrahmen-Karten
5. Fazit-Box unterhalb der Recommendations
6. Gesamteindruck: 1:1 vergleichbar mit vergleichsbericht.html
```

## NICHT TUN in PROMPT 4
- Keine Export-Funktion
- Keine Mobile-Optimierung (kommt in PROMPT 5)
- Fokus auf Intelligence + Visualisierung

---

# PROMPT 5 — Export (HTML/PDF) + Polish

**Nach PROMPT 4 + User-Freigabe.**

**Aufgabe:** Export-Funktion, Mobile-Optimierung, Loading/Error-States, finale Politur.

## Vorgehen

**SCHRITT 1 — Export-Route:**
`src/app/api/payouts/export/route.ts` neu.

Query-Params: `from`, `to`, `format=html|pdf`, `marketplaceSlug?`

- Holt Aggregator-Daten
- Rendert HTML-Template (angelehnt an vergleichsbericht.html Struktur)
- Bei `format=html`: Response mit `Content-Type: text/html`, `Content-Disposition: attachment`
- Bei `format=pdf`: 
  - Falls Puppeteer im Projekt: HTML → PDF via Puppeteer
  - Sonst: @react-pdf/renderer oder install Puppeteer als Dev-Dependency

**SCHRITT 2 — HTML-Template:**
`src/shared/lib/payouts/exportTemplate.ts` neu.

Funktion `renderPayoutsReport(data: OverviewResponse): string` die ein komplettes HTML zurückgibt, inklusive:
- Embedded Chart.js aus CDN
- Inline CSS (komplett selbst-enthalten, offline funktionsfähig)
- Alle Sektionen aus vergleichsbericht.html
- Daten dynamisch eingefügt
- Dateiname: `payouts-report-{currentFrom}-to-{currentTo}.html`

**SCHRITT 3 — Export-Button:**
In PayoutsHeaderV2 neben Sync-Button: Dropdown "Bericht exportieren" mit Optionen HTML / PDF.

Klick → Fetch `/api/payouts/export?format=html` → Browser lädt die Datei.

**SCHRITT 4 — Loading-States:**
- Skeleton-Cards für KPI-Grid während Aggregator lädt
- Chart-Placeholder mit Spinner
- Tabellen mit leeren Zeilen-Skeletons

**SCHRITT 5 — Error-States:**
- Bei leeren Daten: Klare Info-Karte "Keine Daten für diesen Zeitraum — evtl. Sync starten" mit Button
- Bei Aggregator-Fehler: Error-Boundary mit Retry-Button
- Wenn nur Vorperiode Daten hat aber Current nicht: Info "Daten für aktuelle Periode fehlen"

**SCHRITT 6 — Mobile-Optimierung:**
- KPI-Grid: 4→2→1 Spalten je nach Breite
- Detail-Tabelle: Horizontal scrollbar auf Mobile ODER alternatives Accordion-Layout
- Charts: `maintainAspectRatio: false`, responsive
- Header: Periode-Box stapelt vertikal auf Mobile

**SCHRITT 7 — i18n-Vollständigkeit:**
Prüfe dass ALLE Texte in de/en/zh vorhanden sind:
- Preset-Labels
- KPI-Titel
- Section-Header
- Finding-Typen
- Timeframe-Labels
- Button-Texte

**SCHRITT 8 — Performance:**
- Aggregator-Response < 500ms (messen, falls länger: DB-Indexe prüfen)
- Keine N+1-Queries
- `React.memo` für schwere Komponenten (Charts)
- `useMemo` für aufwändige Berechnungen (z.B. daily-Normalisierung)

**SCHRITT 9 — Build:**
typecheck + lint + test + build. Alle grün.

**SCHRITT 10 — Final Report:**
```
FERTIG PROMPT 5 — Ende-zu-Ende-Test bitte:
1. /analytics/payouts öffnen
2. Preset "Letzte 14 Tage" → alle Daten laden in <2s
3. Preset wechseln zu "Letzter Monat" → Werte aktualisieren sich
4. Export "HTML" klicken → Datei wird heruntergeladen
5. HTML-Datei im Browser öffnen → sieht identisch zur Webseite aus
6. Export "PDF" klicken → PDF wird heruntergeladen
7. Mobile-Ansicht (DevTools): Layout bleibt benutzbar
8. Sync starten → Loading-Spinner → Aktualisierung
9. Vergleich mit vergleichsbericht.html: optisch vergleichbar
```

---

# Abschluss-Checkliste (nach PROMPT 5)

Der User sollte am Ende Folgendes verifizieren können:

- [ ] Payouts-Seite hat Header im Stil von vergleichsbericht.html
- [ ] 8 KPI-Karten zeigen Current + Previous + Delta
- [ ] Periode-Presets in Deutsch: 14 Tage, 30 Tage, Settlement, Monat, Quartal, YTD, Custom
- [ ] Vergleichswerte sind UNTERSCHIEDLICH zwischen Current und Previous
- [ ] Day-by-Day Chart mit zwei Linien
- [ ] Detail-Tabelle in 5 Sektionen mit Delta-Pills
- [ ] Marktplatz-Tabelle zeigt ALLE Marktplätze (nicht nur Amazon)
- [ ] Produkt-Performance-Tabelle mit Farbcodierung
- [ ] 3-5 auto-generierte Findings mit farbigen Balken
- [ ] 4 Handlungsempfehlungen in 2x2-Grid dunkel
- [ ] Fazit-Box unter Recommendations
- [ ] Export als HTML und PDF funktioniert
- [ ] Mobile-Ansicht funktioniert
- [ ] Keine englischen Labels mehr ("current", "previous", "lastMonth")
- [ ] Amazon-Logo sichtbar
- [ ] Settlement 182451020558 wird korrekt gespeichert (oder Bug dokumentiert)
- [ ] Keine Console-Errors im Browser
- [ ] Build grün nach jedem Prompt

---

**Ende der Datei. Beginne jetzt mit PROMPT 0.**
