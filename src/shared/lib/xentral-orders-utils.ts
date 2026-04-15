import {
  ADDRESS_ERROR_DEMO_ID_PREFIX,
  buildAddressErrorDemoOrders,
} from "@/app/(dashboard)/xentral/orders/addressErrorDemoOrders";
import {
  emptyPrimaryAddressFields,
  type XentralPrimaryAddressFields,
} from "@/shared/lib/xentralPrimaryAddressFields";

export type AddressValidationState = "ok" | "invalid";

/** Anzeige: Rot bei jedem Fehler; Orange nur „bearbeitet" (ohne Fehler); Grün = ok. */
export type AddressDisplayState = "ok" | "invalid" | "edited";

export type XentralOrderRow = {
  id: string;
  documentNumber: string;
  orderDate: string | null;
  customer: string;
  marketplace?: string;
  total: number | null;
  currency: string | null;
  addressValidation?: AddressValidationState;
  addressValidationIssues?: string[];
  /** Orange „bearbeitet" — Server-Logik folgt später. */
  addressEdited?: boolean;
  addressPrimaryFields?: XentralPrimaryAddressFields;
  /** Bestellnummer (Marktplatz/Web aus Xentral), Spalte im Adressfehler-Popup. */
  internetNumber?: string;
};

export type ImportMode = "recent" | "all";

export type AddressDialogPhase = "edit" | "review";

export type CachedPayload = {
  savedAt: number;
  items: XentralOrderRow[];
  importMode: ImportMode;
  xentralTotalCount: number | null;
  xentralOrderWebBase?: string | null;
  xentralSalesOrderWebPath?: string;
};

export type XentralOrdersLoadOptions = {
  /** `refresh=1` an die API — Server-Cache umgehen, Zeilen bleiben sichtbar (Merge). */
  bustServerCache?: boolean;
  mode?: ImportMode;
  silent?: boolean;
};

/** v15: Merge beim Abgleich, Hintergrund-Sync, kein TTL-Zwang für Cache-Hydration. */
export const XENTRAL_ORDERS_CACHE_KEY = "xentral_orders_cache_v15";

export const AF_INPUT_BASE =
  "h-9 w-full min-w-0 rounded-md border border-border/80 bg-background text-sm shadow-none transition-[box-shadow,background-color,border-color] duration-150 placeholder:text-muted-foreground/45 focus-visible:ring-2 focus-visible:ring-ring/40";

export const AF_INPUT_CORRECTED =
  "border-emerald-600/35 bg-emerald-500/[0.08] text-foreground focus-visible:border-emerald-600/45 focus-visible:ring-emerald-500/20 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-50";

/** Name oder Hausnummer: noch prüfen (amber). */
export const AF_INPUT_UNCERTAIN =
  "border-amber-600/55 bg-amber-500/[0.08] text-foreground focus-visible:border-amber-600/65 focus-visible:ring-amber-500/25 dark:border-amber-500/45 dark:bg-amber-950/35 dark:text-amber-50";

export function formatBerlinYmd(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return y && m && day ? `${y}-${m}-${day}` : "";
}

/** Wie API recentDays=2: heute und Gestern Berlin (inklusiv). */
export function defaultBerlinLastTwoDays(): { from: string; to: string } {
  const toYmd = formatBerlinYmd(new Date());
  const fromYmd = formatBerlinYmd(new Date(Date.now() - 86400000));
  return { from: fromYmd, to: toYmd };
}

/** Bekannte Xentral-Antworten mit verständlicher Erklärung ergänzen (Dialog + Toast). */
export function formatXentralAddressSubmitError(
  raw: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const lower = raw.toLowerCase();
  if (lower.includes("write protected") || lower.includes("write-protected")) {
    return `${raw.trim()}\n\n—\n${t("xentralOrders.writeProtectedAddressHint")}`;
  }
  return raw;
}

export function resolveAddressDisplay(row: {
  addressValidation?: AddressValidationState;
  addressValidationIssues?: string[];
  addressEdited?: boolean;
}): AddressDisplayState {
  const issues = row.addressValidationIssues ?? [];
  if (issues.length > 0 || row.addressValidation === "invalid") return "invalid";
  if (row.addressEdited) return "edited";
  return "ok";
}

export function mergePrimaryFields(row: XentralOrderRow | undefined): XentralPrimaryAddressFields {
  return {
    ...emptyPrimaryAddressFields(),
    ...(row?.addressPrimaryFields ?? {}),
  };
}

/** Reihenfolge im Adress-Dialog / API-Payload — identisch zur Tabellen-Sortierung im Popup. */
export function sortAddressDialogOrders(rows: XentralOrderRow[]): XentralOrderRow[] {
  return [...rows].sort((a, b) =>
    a.documentNumber.localeCompare(b.documentNumber, undefined, { numeric: true })
  );
}

export function withNormalizedPrimaryFields(items: XentralOrderRow[]): XentralOrderRow[] {
  return items.map((item) => {
    const rest = { ...(item as XentralOrderRow & { status?: string }) };
    delete rest.status;
    return {
      ...rest,
      addressPrimaryFields: mergePrimaryFields(item),
      internetNumber: item.internetNumber?.trim() || "—",
    };
  });
}

/** Demo-Bestellungen (tagesaktuell) nur mit NEXT_PUBLIC_XENTRAL_ADDRESS_DEMO_ORDERS=true; Cache bleibt ohne Demo-Zeilen. */
export function applyAddressDemoMerge(items: XentralOrderRow[]): XentralOrderRow[] {
  const withoutDemo = items.filter((r) => !r.id.startsWith(ADDRESS_ERROR_DEMO_ID_PREFIX));
  if (process.env.NEXT_PUBLIC_XENTRAL_ADDRESS_DEMO_ORDERS !== "true") {
    return withNormalizedPrimaryFields(withoutDemo);
  }
  const ymd = formatBerlinYmd(new Date());
  const demo = buildAddressErrorDemoOrders(ymd);
  return withNormalizedPrimaryFields([...demo, ...withoutDemo]);
}

export function addressFieldNorm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
