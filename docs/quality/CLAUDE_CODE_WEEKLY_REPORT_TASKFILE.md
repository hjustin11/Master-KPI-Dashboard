# Weekly Presentation Report — Arbeitsauftrag

**Lies diese Datei VOLLSTÄNDIG bevor du anfängst.**

Diese Datei enthält 3 Prompts (PROMPT 0 bis PROMPT 2). Arbeite sie **STRIKT in dieser Reihenfolge** ab. Nach jedem Prompt STOPPST du, machst Build + Test, und wartest auf User-Freigabe.

**Ziel:** Neuer Reiter unter Analytics → "Wochenbericht" für Meetings mit der Geschäftsführung. Zeigt letzte KW vs. vorletzte KW, alle Marktplätze außer Shopify, mit Aufklapp-Details.

---

## Arbeits-Regeln

1. **Ein Prompt = eine Session.** Nach Fertigstellung STOPP, warten auf Freigabe.
2. **Nach JEDEM Prompt:** `npm run typecheck && npm run lint && npm run build`. Bei Fehler: STOPP.
3. **Keine Zusatz-Features.** Ideen notierst du, baust sie nicht jetzt.
4. **Status-Report am Ende:** "FERTIG PROMPT X — Test bitte: [konkrete Anweisung]"
5. **Bei Blockern:** STOPP, User fragen.

---

## Projektkontext

**Stack:** Next.js 16, React 19, TypeScript strict, Tailwind 4, Supabase PRO, TanStack Query 5.

**Relevante bestehende Dateien:**
- `src/app/(dashboard)/analytics/marketplaces/page.tsx` (582 LOC Orchestrator)
- `src/shared/lib/marketplaceProductClientMerge.ts` (Daten-Merge)
- `src/shared/lib/periodResolver.ts` (KW-Helfer — falls vorhanden, sonst neu)
- `src/app/api/{slug}/sales/route.ts` — Sales-APIs pro Marktplatz

**Harte Anforderungen:**
- Shopify NIE einbeziehen — weder in Summen, noch in Tabelle, noch im Dropdown
- KW-Logik ist Montag 00:00 bis Sonntag 23:59 (lokale Zeit Europe/Berlin)
- Default-Periode: letzte vollständige KW (heute minus mindestens 1 Tag nach Sonntag)
- Vergleichsperiode: KW davor (letzte_kw - 1)
- Alle Zahlen gerundet: Umsatz auf €, Anteile auf 1 Nachkommastelle

---

# PROMPT 0 — Bestandsaufnahme + API-Route

**Einzige Aufgabe:** Daten-Beschaffung klären und API bauen. Noch keine UI.

## Vorgehen

**SCHRITT 1 — Bestandsaufnahme:**

Zeig mir:

a) Wo ist die KW-Logik im Projekt? Existiert ein `periodResolver.ts` 
   oder ähnlich? Wenn ja: kann man Montag-Sonntag-Ranges daraus holen?

b) Welche Marktplätze haben Sales-APIs die tägliche oder orderbasierte 
   Daten liefern? Liste pro Marktplatz:
   - Endpoint-Name
   - Ob Daten pro Order oder pro Tag aggregiert
   - Ob Produkt-SKU-Breakdown möglich ist
   - Ob Retouren-Info dabei ist

c) Wie lädt `analytics/marketplaces/page.tsx` aktuell die Marktplatz-
   Daten? Parallel-Fetch? Aggregator?

d) Excludiert das bestehende System Shopify schon irgendwo?

e) Gibt es bereits Produkt-Level-Aggregation pro Marktplatz 
   (für die Top-Gewinner/Verlierer-Anzeige)?

**SCHRITT 2 — Plan vorstellen:**

Schick mir:

```
ANALYSE-PLAN WOCHENBERICHT:

1. KW-Resolver:
   [vorhanden / muss gebaut werden]
   Pfad: [...]

2. Verfügbare Marktplätze für Wochenbericht:
   - Amazon DE: [Endpoint]
   - Otto: [Endpoint]
   - Kaufland: [Endpoint]
   - Fressnapf: [Endpoint]
   - MediaMarkt: [Endpoint]
   - Zooplus: [Endpoint]
   - eBay: [Endpoint oder BROKEN]
   - TikTok: [Endpoint oder PLANNED]
   
3. Datenverfügbarkeit pro Marktplatz:
   Tägliche Breakdown? [ja/nein pro MP]
   SKU-Breakdown? [ja/nein pro MP]
   Retouren-Info? [ja/nein pro MP]

4. Shopify-Exclusion:
   [wo aktuell, wo muss es noch]

5. Geschätzte Dauer für PROMPT 0: X Std
```

Warte auf Freigabe.

**SCHRITT 3 — KW-Resolver (falls nötig):**

`src/shared/lib/weeklyReport/isoWeekResolver.ts`:

```typescript
export type IsoWeek = {
  year: number;
  week: number;
  start: Date;  // Montag 00:00
  end: Date;    // Sonntag 23:59:59
  label: string; // "KW 16 / 2026"
};

export function getIsoWeek(date: Date): IsoWeek;
export function getPreviousIsoWeek(week: IsoWeek): IsoWeek;
export function getIsoWeekByNumber(year: number, week: number): IsoWeek;
export function getAvailableWeeksBack(count: number): IsoWeek[];
```

Nutze date-fns `startOfISOWeek`, `endOfISOWeek`, `getISOWeek`. ISO-8601 
(Montag als Wochenstart). Zeitzone: Europe/Berlin.

**SCHRITT 4 — Datenservice:**

`src/shared/lib/weeklyReport/weeklyReportService.ts`:

```typescript
export type WeeklyMarketplaceData = {
  slug: string;
  name: string;
  logo: string;
  
  current: {
    revenue: number;
    orders: number;
    avgOrderValue: number;
    returnRate: number;
    returnCount: number;
  };
  previous: {
    revenue: number;
    orders: number;
    avgOrderValue: number;
    returnRate: number;
    returnCount: number;
  };
  
  // Deltas
  deltas: {
    revenuePercent: number;
    ordersPercent: number;
    avgOrderValuePercent: number;
    returnRatePp: number;  // percentage points
  };
  
  // Für Sparkline: 7 Tagespunkte (Mo-So) der aktuellen Woche
  dailyRevenue: number[];
  
  // Für Aufklapp-Details
  topGainers: Array<{
    sku: string;
    name: string;
    revenueCurrent: number;
    revenuePrevious: number;
    deltaPercent: number;
  }>;
  topLosers: Array<{ /* gleiche Shape */ }>;
  
  averagePriceTrend: {
    current: number;
    previous: number;
    deltaPercent: number;
  };
};

export async function getWeeklyReport(
  supabase: SupabaseClient,
  currentWeek: IsoWeek,
  previousWeek: IsoWeek
): Promise<{
  weeks: { current: IsoWeek; previous: IsoWeek };
  totals: {
    current: { revenue: number; orders: number; avgOrderValue: number; returnRate: number };
    previous: { /* gleiche Shape */ };
    deltas: { revenuePercent: number; ordersPercent: number; avgOrderValuePercent: number; returnRatePp: number };
  };
  marketplaces: WeeklyMarketplaceData[];
  narrative: string;  // Auto-generierter Satz
}>;
```

**Shopify-Exclusion:** Hardcoded Liste von Marktplatz-Slugs die IGNORIERT 
werden. Mindestens `["shopify"]`. Auch eBay und TikTok ausschließen wenn 
deren Daten nicht stabil sind (aus Analyse Schritt 1 entscheiden).

**Narrative-Generator:** Einfache Regeln, kein LLM nötig:
- Top-Gewinner-Marktplatz identifizieren (größtes positives Delta in %)
- Top-Verlierer identifizieren
- Gesamt-Umsatz-Delta zeigen
- Satz bauen:
  "Gesamtumsatz {delta}% auf {revenue} € · {winner.name} (+{w%}) dominiert · {loser.name} ({l%}) schwächelt"

**SCHRITT 5 — API-Route:**

`src/app/api/analytics/weekly-report/route.ts`:

```typescript
export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get("year") ?? "") || undefined;
  const week = parseInt(url.searchParams.get("week") ?? "") || undefined;
  
  const currentWeek = year && week 
    ? getIsoWeekByNumber(year, week)
    : getLastCompletedIsoWeek();
  const previousWeek = getPreviousIsoWeek(currentWeek);
  
  const report = await getWeeklyReport(supabase, currentWeek, previousWeek);
  return apiOk(report);
});
```

**SCHRITT 6 — Build-Check:**
typecheck + lint + build. Alle grün.

**SCHRITT 7 — Status-Report:**
```
FERTIG PROMPT 0 — Test bitte:

1. GET /api/analytics/weekly-report
2. Response enthält:
   - weeks: { current: KW16, previous: KW15 }
   - totals mit aktuellem + Delta
   - marketplaces Array mit je Marktplatz (OHNE Shopify)
   - narrative als Satz
3. GET /api/analytics/weekly-report?year=2026&week=15
   → lädt KW 15 vs KW 14
4. Shopify ist NICHT im Response
5. Narrative ist sinnvoll formuliert
```

## NICHT TUN in PROMPT 0
- Keine UI
- Keine Tabelle
- Keine Charts
- Nur Backend

---

# PROMPT 1 — UI: Haupttabelle + Story + Summary-KPIs

**Nach PROMPT 0 + User-Freigabe.**

**Aufgabe:** Neuer Sidebar-Eintrag und die Hauptansicht (Header, Story, 4 Summary-KPIs, Hybrid-Tabelle mit Sparklines und Anteilsbalken). Noch kein Aufklappen für Details.

## Vorgehen

**SCHRITT 1 — Route + Sidebar:**

Route: `/analytics/weekly-report`
File: `src/app/(dashboard)/analytics/weekly-report/page.tsx`

Sidebar-Eintrag unter Analytics:
- Label: "Wochenbericht" (de) / "Weekly Report" (en) / "周报" (zh)
- Icon: `CalendarDays` oder `FileText`
- Position: nach "Marktplätze" vor "Payouts"

Access-Config: Owner/Admin/Manager sehen es. Analyst/Viewer default AUS
(kann später aktiviert werden).

**SCHRITT 2 — Page-Layout:**

```tsx
<div>
  <WeeklyReportHeader 
    currentWeek={data.weeks.current}
    previousWeek={data.weeks.previous}
    onWeekChange={...}
    onExport={...}
  />
  <WeeklyReportStory narrative={data.narrative} totals={data.totals} />
  <WeeklyReportSummaryGrid totals={data.totals} />
  <WeeklyReportTable marketplaces={data.marketplaces} />
</div>
```

**SCHRITT 3 — Header-Komponente:**

Oben:
- Badge "Wochenbericht · Präsentationssicht" klein
- Titel "KW {current.week} vs. KW {previous.week}" groß (22px)
- Datumsrange "13.–19. Apr. · verglichen mit 06.–12. Apr." dezent
- Rechts: KW-Dropdown (letzte 12 KW zur Auswahl) + Export-Button

KW-Dropdown:
```tsx
<select value={`${year}-${week}`} onChange={...}>
  {availableWeeks.map(w => (
    <option key={w.key} value={w.key}>
      KW {w.week} / {w.year}
    </option>
  ))}
</select>
```

Default: letzte vollständige KW (nicht heutige).

**SCHRITT 4 — Story-Bar:**

```tsx
<div className="bg-slate-50 dark:bg-slate-900 rounded-md px-4 py-3 my-5">
  <div className="text-[11px] uppercase tracking-wide text-slate-500">
    Kernaussage
  </div>
  <div className="text-base leading-relaxed mt-1">
    Gesamtumsatz 
    <span className="text-emerald-600 font-medium"> +12,4 % </span>
    auf <span className="font-medium">47.820 €</span> · 
    Otto <span className="text-emerald-600">+34 %</span> dominiert · 
    Amazon DE <span className="text-red-600">−8 %</span> schwächelt
  </div>
</div>
```

Dynamisch aus data.narrative. Die inline-Zahlen musst du beim narrative-
String parsen — einfacher: Generator liefert strukturierte Objekte statt 
Plain-String.

Erweitere WeeklyReportData:
```typescript
narrative: {
  text: string;  // fallback
  segments: Array<
    | { type: "text"; value: string }
    | { type: "metric"; value: string; trend: "up" | "down" | "flat" }
  >;
};
```

**SCHRITT 5 — Summary-KPIs (4 Karten):**

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ UMSATZ      │ BESTELL.    │ Ø BEST.WERT │ RETOUREN    │
│ 47.820 €    │ 1.284       │ 37,24 €     │ 6,8 %       │
│ ↑ 12,4 %    │ ↑ 8,1 %     │ ↑ 4,0 %     │ ↑ 0,4 pp    │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

Design:
- `bg-slate-50 dark:bg-slate-900` (kein starker border)
- `rounded-md`, `p-3 px-4`
- Label 11px uppercase
- Zahl 20px font-medium
- Delta 12px in Farbe (grün/rot/grau)

**SCHRITT 6 — Hybrid-Tabelle:**

Spalten:
1. Marktplatz (Logo + Name)
2. Umsatz + Delta
3. Anteil (horizontaler Balken + Prozent)
4. Bestellungen
5. Retouren
6. Trend (Sparkline 7 Tage)

Anteils-Balken:
```tsx
<div className="flex items-center gap-1.5">
  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
    <div 
      className="h-full rounded-full"
      style={{ 
        width: `${sharePercent}%`, 
        background: deltaIsPositive ? "#639922" : "#BA7517" 
      }}
    />
  </div>
  <span className="text-[11px] text-slate-500 min-w-[36px] text-right">
    {sharePercent.toFixed(1)} %
  </span>
</div>
```

Sparkline:
```tsx
<svg width="48" height="18" viewBox="0 0 48 18">
  <polyline 
    points={sparklinePoints(dailyRevenue)}
    fill="none" 
    stroke={trendColor} 
    strokeWidth="1.5"
  />
</svg>
```

`sparklinePoints`: normalisiert 7 Werte auf 2..42 X und 2..16 Y-Range 
(invertiert, weil SVG).

`trendColor`: basierend auf Gesamt-Delta dieser Woche:
- `#639922` (grün) wenn deltaPercent > +5
- `#E24B4A` (rot) wenn deltaPercent < -5
- `#888780` (grau) bei -5 bis +5

Zeilen:
- Hover: `bg-slate-50 dark:bg-slate-900/50`
- Cursor-pointer (Klick-Verhalten kommt in PROMPT 2)
- Padding vertikal 14px

Sortierung: nach Umsatz absteigend (Default).

**SCHRITT 7 — Export-Button (Stub):**

Button oben: "Export PDF". In PROMPT 1 nur Toast "Kommt in PROMPT 2".

**SCHRITT 8 — i18n:**

Keys in de/en/zh:
- `weeklyReport.title`
- `weeklyReport.subtitle`
- `weeklyReport.kpi.revenue/orders/aov/returns`
- `weeklyReport.table.headers.*`
- `weeklyReport.story.fallback`

**SCHRITT 9 — Build-Check:**
typecheck + lint + build. Alle grün.

**SCHRITT 10 — Status-Report:**
```
FERTIG PROMPT 1 — Test bitte:

1. Sidebar zeigt "Wochenbericht" unter Analytics
2. /analytics/weekly-report öffnet Seite
3. Header zeigt aktuelle KW + Dropdown funktioniert
4. Story-Bar zeigt Auto-Satz mit farbigen Zahlen
5. 4 Summary-KPIs oben (Umsatz, Best., Ø, Retouren)
6. Tabelle mit allen Marktplätzen AUSSER Shopify
7. Jede Zeile: Logo, Name, Umsatz+Delta, Anteilsbalken, Best., Retour., Sparkline
8. Sparklines zeigen den 7-Tage-Verlauf
9. Anteilsbalken entsprechen dem Umsatz-Anteil
10. Dropdown auf KW 15 wechseln → Seite lädt Vorwochen-Daten
11. Mobile: horizontal scrollbar für Tabelle
12. Keine Console-Errors
```

## NICHT TUN in PROMPT 1
- Kein Aufklappen der Zeilen
- Kein Export
- Keine Detail-SKU-Listen
- Nur Hauptansicht

---

# PROMPT 2 — Aufklapp-Details + PDF-Export

**Nach PROMPT 1 + User-Freigabe.**

**Aufgabe:** Zeilen werden klickbar und zeigen Top-Gewinner, Top-Verlierer, Preisentwicklung. Plus PDF-Export der kompletten Ansicht.

## Vorgehen

**SCHRITT 1 — Aufklapp-Verhalten:**

Klick auf Zeile toggelt `expanded` State (useState-Array oder Set mit Slug).

Aufgeklappte Zeile rendert darunter eine zusätzliche tr mit colspan:

```tsx
{expanded.has(mp.slug) && (
  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b">
    <td colSpan={6} className="p-4 pl-14">
      <div className="grid grid-cols-3 gap-5">
        <TopGainersList items={mp.topGainers} />
        <TopLosersList items={mp.topLosers} />
        <PriceTrendBox trend={mp.averagePriceTrend} />
      </div>
    </td>
  </tr>
)}
```

**SCHRITT 2 — Top-Gewinner-Liste:**

```tsx
<div>
  <div className="text-[11px] uppercase text-slate-500 mb-1.5">
    Top-Gewinner
  </div>
  {items.slice(0, 3).map(item => (
    <div className="flex justify-between py-1 text-sm">
      <span className="truncate mr-2">{item.sku}</span>
      <span className="text-emerald-600 font-medium">
        +{item.deltaPercent.toFixed(0)} %
      </span>
    </div>
  ))}
</div>
```

Analog Top-Verlierer (rot).

**SCHRITT 3 — Preis-Trend-Box:**

```tsx
<div>
  <div className="text-[11px] uppercase text-slate-500 mb-1.5">
    Preisentwicklung
  </div>
  <div className="text-sm py-1">
    Ø-Preis: <span className="font-medium">
      {formatCurrency(trend.current)}
    </span>
  </div>
  <div className="text-sm py-1 text-slate-600">
    Vorwoche: {formatCurrency(trend.previous)}
  </div>
  <div className={clsx(
    "text-sm py-1",
    trend.deltaPercent > 0 ? "text-emerald-600" : "text-red-600"
  )}>
    Trend: {trend.deltaPercent > 0 ? "↑" : "↓"} 
    {Math.abs(trend.deltaPercent).toFixed(1)} %
  </div>
</div>
```

**SCHRITT 4 — Icons für expand:**

Kleiner Chevron links vom Marktplatz-Logo:
```tsx
<ChevronRight 
  className={clsx(
    "h-3.5 w-3.5 text-slate-400 transition-transform",
    expanded.has(mp.slug) && "rotate-90"
  )} 
/>
```

Zeile bekommt `cursor-pointer` und Hover-Highlight.

**SCHRITT 5 — "Alle aufklappen" Toggle:**

Oberhalb der Tabelle rechts:
```tsx
<button onClick={toggleAll} className="text-sm text-slate-500">
  {allExpanded ? "Alle zuklappen" : "Alle aufklappen"}
</button>
```

Nützlich für Präsentation: Meeting-Leiter klappt alle auf, Detail-Fragen 
sind sofort beantwortbar.

**SCHRITT 6 — PDF-Export:**

Route: `src/app/api/analytics/weekly-report/export/route.ts`

Strategie: Server-seitig HTML rendern und mit Puppeteer zu PDF machen.

```typescript
import { renderWeeklyReportHtml } from "@/shared/lib/weeklyReport/htmlRenderer";
import puppeteer from "puppeteer";

export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get("year") ?? "");
  const week = parseInt(url.searchParams.get("week") ?? "");
  
  const data = await getWeeklyReport(/* ... */);
  const html = renderWeeklyReportHtml(data);
  
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  const pdf = await page.pdf({ 
    format: "A4", 
    landscape: true,
    printBackground: true,
    margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" }
  });
  await browser.close();
  
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="wochenbericht-kw${week}-${year}.pdf"`
    }
  });
});
```

Falls puppeteer nicht installiert: `npm install puppeteer` + evtl. 
`@sparticuz/chromium` für Vercel-Deploy.

`htmlRenderer`: eigenständiges HTML mit inline CSS, nutzt ChartJS via CDN 
nicht — zeichnet Sparklines und Balken als inline SVG analog zur UI.

**SCHRITT 7 — Export-UI:**

Button "Export PDF" triggert:
1. Loading-State (Button disabled)
2. Download via `fetch` + Blob + Anchor-Element
3. Toast bei Erfolg/Fehler

**SCHRITT 8 — Build-Check:**
typecheck + lint + build. Alle grün.

**SCHRITT 9 — Status-Report:**
```
FERTIG PROMPT 2 — End-to-End-Test bitte:

1. /analytics/weekly-report
2. Klick auf Amazon-Zeile: Zeile klappt auf
3. Sieht: Top-Gewinner (3 SKUs grün), Top-Verlierer (3 SKUs rot), 
   Preisentwicklung
4. Chevron dreht sich um 90°
5. Nochmal klicken: klappt zu
6. "Alle aufklappen" Toggle funktioniert
7. Export-Button:
   - Klick → kurze Loading-Phase
   - PDF wird heruntergeladen
   - Dateiname: "wochenbericht-kw16-2026.pdf"
   - PDF zeigt Header, Story, KPIs, Tabelle (auch aufgeklappte Zeilen falls so markiert)
   - Layout bleibt erkennbar
8. Mobile: Aufklappen funktioniert, Inhalt scrollt
```

---

# Abschluss-Checkliste nach PROMPT 2

- [ ] Sidebar-Eintrag "Wochenbericht" unter Analytics
- [ ] KW-Dropdown mit 12 vergangenen Wochen
- [ ] Header mit dynamischen Datums-Labels
- [ ] Auto-Narrative als Kernaussage-Bar
- [ ] 4 Summary-KPIs mit Deltas
- [ ] Hybrid-Tabelle mit Anteilsbalken und Sparklines
- [ ] Shopify überall ausgeschlossen (Tabelle, Summen, Dropdown)
- [ ] Aufklappen zeigt Top-Gewinner/Verlierer/Preistrend
- [ ] "Alle aufklappen" Toggle
- [ ] PDF-Export funktioniert
- [ ] i18n de/en/zh
- [ ] Mobile benutzbar
- [ ] Keine Console-Errors
- [ ] Build grün nach jedem Prompt

---

**Ende der Datei. Beginne jetzt mit PROMPT 0.**
