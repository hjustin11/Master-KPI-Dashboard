/**
 * Gemeinsame Typo- und Kachel-Tokens für Amazon-Artikel-Editor und Marktplatz-Shell-Dialoge.
 */

export const MARKETPLACE_PRODUCT_EDITOR_SECTION =
  "rounded-md border border-border bg-card p-1.5 shadow-sm sm:p-2";

export const MARKETPLACE_PRODUCT_EDITOR_H3 =
  "text-[12px] font-semibold leading-tight text-foreground";

export const MARKETPLACE_PRODUCT_EDITOR_HINT =
  "mt-0.5 text-[10px] leading-snug text-muted-foreground";

export const MARKETPLACE_PRODUCT_EDITOR_LABEL =
  "flex flex-col gap-0.5 text-[10px] font-medium";

/** Inputs / Select-Trigger – einheitliche Größe, alle Breakpoints (überschreibt `md:text-sm` der UI-Basis). */
export const MARKETPLACE_PRODUCT_EDITOR_CONTROL =
  "h-6 min-h-6 px-1.5 py-0 text-[12px] sm:text-[12px] md:text-[12px] lg:text-[12px] leading-tight [&_svg]:size-3";

export const MARKETPLACE_PRODUCT_EDITOR_FIELD =
  "text-[12px] sm:text-[12px] md:text-[12px] lg:text-[12px] leading-snug placeholder:text-muted-foreground";

export const MARKETPLACE_PRODUCT_EDITOR_DIALOG_BACKDROP =
  "bg-black/50 supports-backdrop-filter:backdrop-blur-sm";

export const MARKETPLACE_PRODUCT_EDITOR_DIALOG_CONTENT_CLASS =
  "flex max-h-[min(96vh,calc(100dvh-0.5rem))] w-[min(96rem,calc(100vw-1rem))] max-w-[min(96rem,calc(100vw-1rem))] flex-col gap-0 overflow-hidden border border-border bg-card p-0 text-foreground shadow-xl sm:w-[min(96rem,calc(100vw-1rem))] sm:max-w-[min(96rem,calc(100vw-1rem))]";

export const MARKETPLACE_PRODUCT_EDITOR_HEADER_CLASS =
  "shrink-0 border-b border-border bg-card px-2 py-1 sm:px-2.5";

export const MARKETPLACE_PRODUCT_EDITOR_TITLE_CLASS =
  "flex items-center gap-1.5 text-sm font-semibold leading-tight tracking-tight";

export const MARKETPLACE_PRODUCT_EDITOR_LOGO_WRAP_CLASS =
  "inline-flex h-8 w-[4.25rem] shrink-0 items-center justify-center rounded border border-border bg-background px-1";

export const MARKETPLACE_PRODUCT_EDITOR_LOGO_IMG_CLASS =
  "max-h-6 max-w-full object-contain object-left";

export const MARKETPLACE_PRODUCT_EDITOR_SCROLL_OUTER_CLASS =
  "relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background";

export const MARKETPLACE_PRODUCT_EDITOR_BODY_PADDING_CLASS =
  "space-y-1 px-1.5 py-1 sm:px-2 sm:py-1.5";

/** DialogFooter: negative Ränder der UI-Basis neutralisieren (sonst Clipping bei `p-0` Content). */
export const MARKETPLACE_PRODUCT_EDITOR_FOOTER_CLASS =
  "mx-0 mb-0 shrink-0 gap-1 rounded-none border-t border-border bg-card px-1.5 py-1 sm:flex-row sm:justify-between sm:px-2";

export const MARKETPLACE_PRODUCT_EDITOR_ALERT_SM_CLASS =
  "rounded-md border px-2 py-1 p-1.5 text-[10px] leading-snug";
