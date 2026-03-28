/**
 * Incrementeller Abgleich von Xentral-Bestelllisten: nur geänderte Zeilen ersetzen,
 * Referenzen unveränderter Zeilen behalten (weniger Re-Renders).
 */

export type XentralOrderMergeRow = {
  id: string;
  documentNumber: string;
  orderDate: string | null;
  customer: string;
  marketplace?: string;
  total: number | null;
  currency: string | null;
  addressValidation?: string;
  addressValidationIssues?: string[];
  addressEdited?: boolean;
  addressPrimaryFields?: Record<string, string>;
  internetNumber?: string;
};

/** Vergleichsgrundlage wie von Xentral/Server berechnet (ohne UI-only). */
export function xentralOrderServerFingerprint(row: XentralOrderMergeRow): string {
  const issues = [...(row.addressValidationIssues ?? [])].sort();
  const fields = row.addressPrimaryFields ?? {};
  const sortedFieldKeys = Object.keys(fields).sort();
  const addressPrimaryFields: Record<string, string> = {};
  for (const k of sortedFieldKeys) {
    addressPrimaryFields[k] = fields[k] ?? "";
  }
  return JSON.stringify({
    documentNumber: row.documentNumber,
    orderDate: row.orderDate,
    customer: row.customer,
    marketplace: row.marketplace ?? "",
    total: row.total,
    currency: row.currency,
    internetNumber: row.internetNumber ?? "",
    addressPrimaryFields,
    addressValidation: row.addressValidation ?? "",
    addressValidationIssues: issues,
  });
}

export function sortXentralOrdersByDateDesc<T extends XentralOrderMergeRow>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = a.orderDate?.slice(0, 10) ?? "";
    const db = b.orderDate?.slice(0, 10) ?? "";
    const c = db.localeCompare(da);
    if (c !== 0) return c;
    const mp = (a.marketplace ?? "").localeCompare(b.marketplace ?? "");
    if (mp !== 0) return mp;
    return b.documentNumber.localeCompare(a.documentNumber);
  });
}

export type MergeXentralOrdersOptions = {
  /** recent: Zeilen, die nicht mehr in `fresh` vorkommen, entfernen (außer lokal bearbeitete). */
  dropMissingFromPrevious: boolean;
};

/**
 * @param previous — aktueller UI-/Cache-Stand
 * @param fresh — neue API-Antwort (normalisiert)
 */
export function mergeXentralOrderLists<T extends XentralOrderMergeRow>(
  previous: T[],
  fresh: T[],
  options: MergeXentralOrdersOptions
): T[] {
  const prevById = new Map(previous.map((r) => [r.id, r]));
  const next: T[] = [];
  const seen = new Set<string>();

  for (const row of fresh) {
    const prev = prevById.get(row.id);
    if (prev?.addressEdited) {
      next.push(prev);
      seen.add(row.id);
      continue;
    }
    if (prev && xentralOrderServerFingerprint(prev) === xentralOrderServerFingerprint(row)) {
      next.push(prev);
    } else {
      next.push(row);
    }
    seen.add(row.id);
  }

  if (options.dropMissingFromPrevious) {
    for (const p of previous) {
      if (!seen.has(p.id)) {
        if (p.addressEdited) {
          next.push(p);
        }
      }
    }
  } else {
    for (const p of previous) {
      if (!seen.has(p.id)) {
        next.push(p);
      }
    }
  }

  return sortXentralOrdersByDateDesc(next);
}
