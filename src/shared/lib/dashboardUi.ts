/**
 * Einheitliche Dashboard-Typografie und Tabellen — orientiert an Artikelprognose (`DataTable` mit `compact`).
 * Kopfzeilen: 11px; Tabellenzellen: `text-xs` (12px).
 */

/** Primäre Seitenüberschriften (h1) — eine Stufe kleiner als zuvor, überall gleich. */
export const DASHBOARD_PAGE_TITLE = "text-xl font-bold tracking-tight";

/** Sektions-/Kartenüberschriften (h2) unterhalb der Seitenebene. */
export const DASHBOARD_SECTION_TITLE = "text-lg font-semibold tracking-tight text-foreground";

export const DASHBOARD_PAGE_SUBTITLE = "text-sm text-muted-foreground";

/** Haupt-Layout für volle Breite unter dem Shell-Header. */
export const DASHBOARD_PAGE_SHELL =
  "flex min-h-[calc(100vh-12rem)] w-full min-w-0 flex-col gap-6";

/**
 * Root-Container wie `DataTable` mit `compact` (Toolbar + Karte).
 */
export const DASHBOARD_COMPACT_CARD =
  "flex flex-col gap-3 rounded-xl border border-border/50 bg-card/80 p-3 backdrop-blur-sm md:p-4";

/**
 * Scrollbereich um `<Table>`: gleiche Zell-Paddings und Schriftgrößen wie `DataTable` compact.
 */
export const DASHBOARD_COMPACT_TABLE_SCROLL =
  "min-h-[360px] flex-1 overflow-auto rounded-lg border border-border/50 [&_[data-slot=table-head]]:!h-7 [&_[data-slot=table-head]]:!px-1.5 [&_[data-slot=table-head]]:!py-1 [&_[data-slot=table-head]]:!text-[11px] [&_[data-slot=table-cell]]:!px-1.5 [&_[data-slot=table-cell]]:!py-1 [&_[data-slot=table-cell]]:!text-xs";

/** Direkt auf `<Table>` (Zelltext-Basis). */
export const DASHBOARD_COMPACT_TABLE_TEXT = "text-xs";

/** Meta-Zeilen / Hinweise unter Toolbars (wie Sync-Status in Artikelprognose). */
export const DASHBOARD_META_TEXT = "text-xs text-muted-foreground";

/**
 * Rohe `<table>` mit `<th>`/`<td>` (ohne shadcn `data-slot`) — gleiche Maße wie kompakte DataTable.
 */
export const DASHBOARD_PLAIN_TABLE_WRAP =
  "overflow-x-auto rounded-lg border border-border/50 [&_th]:h-7 [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-[11px] [&_th]:font-medium [&_td]:px-1.5 [&_td]:py-1 [&_td]:text-xs";
