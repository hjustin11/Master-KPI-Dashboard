/**
 * Einheitliche Dashboard-Typografie und Tabellen — orientiert an Bedarfsprognose (`DataTable` mit `compact`).
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
 * Einheitliche Marktplatz-Logo-Fläche (Bestellungen, Produkte, …), orientiert an Otto → Bestellungen.
 * Feste Höhe/Breite; das Asset skaliert mit `object-contain` (Farben und Seitenverhältnis bleiben erhalten).
 */
export const DASHBOARD_MARKETPLACE_LOGO_FRAME = "relative block h-10 w-[120px] shrink-0";

/** Für Next.js `<Image fill />` innerhalb von `DASHBOARD_MARKETPLACE_LOGO_FRAME`. */
export const DASHBOARD_MARKETPLACE_LOGO_IMAGE_FILL = "object-contain object-left";

/** Für `<img>` innerhalb von `DASHBOARD_MARKETPLACE_LOGO_FRAME`. */
export const DASHBOARD_MARKETPLACE_LOGO_IMG_IN_FRAME = "h-full w-full object-contain object-left";

/** MediaMarkt & Saturn Wortmarke 2023 (SVG, transparent), Wikimedia Commons. */
export const WIKIMEDIA_MEDIAMARKT_SATURN_LOGO_SVG =
  "https://upload.wikimedia.org/wikipedia/commons/0/02/Media_Markt_%26_Saturn_Logo_01.2023.svg";

/** zooplus Wortmarke (PNG), Wikimedia Commons — oft mit Transparenz. */
export const WIKIMEDIA_ZOOPLUS_LOGO_PNG =
  "https://upload.wikimedia.org/wikipedia/commons/7/7c/Zooplus_logo.png";

/** Fressnapf Wortmarke 2023 (SVG, transparent), Wikimedia Commons — gleiche Fläche wie Otto (`DASHBOARD_MARKETPLACE_LOGO_FRAME`). */
export const WIKIMEDIA_FRESSNAPF_LOGO_2023_SVG =
  "https://upload.wikimedia.org/wikipedia/commons/9/9f/Fressnapf_Logo_2023.svg";

/** Shopify Wortmarke 2018 (SVG, transparent), Wikimedia Commons. */
export const WIKIMEDIA_SHOPIFY_LOGO_2018_SVG =
  "https://upload.wikimedia.org/wikipedia/commons/0/0e/Shopify_logo_2018.svg";

/**
 * Zusatz zu `DASHBOARD_MARKETPLACE_LOGO_FRAME`: etwas breiter, gleiche Höhe (z. B. Fressnapf-Wortmarke).
 */
export const DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_MD =
  "h-10 w-[min(100%,10rem)]";

/**
 * Zusatz zu `DASHBOARD_MARKETPLACE_LOGO_FRAME` für größere Markenlogos (tailwind-merge überschreibt Maße).
 */
export const DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_LG =
  "h-12 w-[min(100%,15rem)] sm:h-14 sm:w-[17.5rem]";

/** Extra breit (z. B. MediaMarkt & Saturn Kombi). */
export const DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_XL =
  "h-12 w-[min(100%,20rem)] sm:h-14 sm:w-[22rem]";

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

/** Meta-Zeilen / Hinweise unter Toolbars (wie Sync-Status in Bedarfsprognose). */
export const DASHBOARD_META_TEXT = "text-xs text-muted-foreground";

/**
 * Rohe `<table>` mit `<th>`/`<td>` (ohne shadcn `data-slot`) — gleiche Maße wie kompakte DataTable.
 */
export const DASHBOARD_PLAIN_TABLE_WRAP =
  "overflow-x-auto rounded-lg border border-border/50 [&_th]:h-7 [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-[11px] [&_th]:font-medium [&_td]:px-1.5 [&_td]:py-1 [&_td]:text-xs";

/**
 * Marktplatz „Produkte“-Listen (alle `MarketplaceProductsView`-Seiten): feste Tabellenaufteilung.
 * Anteile: SKU 14 %, Sekundär-ID 14 %, Artikelname 58 %, Status 14 % (= 100 %).
 */
export const MARKETPLACE_PRODUCTS_TABLE_CLASS = "table-fixed w-full";

export const MARKETPLACE_PRODUCTS_COL_SKU = "w-[14%] min-w-0";
export const MARKETPLACE_PRODUCTS_COL_SECONDARY_ID = "w-[14%] min-w-0";
export const MARKETPLACE_PRODUCTS_COL_TITLE = "w-[58%] min-w-0";
export const MARKETPLACE_PRODUCTS_COL_STATUS = "w-[14%] min-w-0";
