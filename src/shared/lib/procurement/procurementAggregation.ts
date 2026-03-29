/** Gemeinsame Kennzahlen für Beschaffungszeilen (UI + Import-Vergleich). */

export type ProcurementRowLike = {
  containerNumber: string;
  sortIndex: number;
  arrivalAtPort: string;
  amount: number;
};

export function containerKey(r: { containerNumber: string }): string {
  return r.containerNumber.trim() || "—";
}

export function parseArrivalUtc(s: string): number | null {
  const x = s.trim();
  if (!x) return null;
  const m = x.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

export function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function groupAllByContainer<T extends ProcurementRowLike>(lines: T[]): T[][] {
  if (lines.length === 0) return [];
  const keyToRows = new Map<string, T[]>();
  const keyOrder: string[] = [];
  const seenKey = new Set<string>();
  for (const line of lines) {
    const k = containerKey(line);
    let g = keyToRows.get(k);
    if (!g) {
      g = [];
      keyToRows.set(k, g);
    }
    g.push(line);
    if (!seenKey.has(k)) {
      seenKey.add(k);
      keyOrder.push(k);
    }
  }
  return keyOrder.map((k) => {
    const rows = keyToRows.get(k)!;
    rows.sort((a, b) => a.sortIndex - b.sortIndex);
    return rows;
  });
}

export function groupTotalAmount(rows: ProcurementRowLike[]): number {
  return rows.reduce((acc, r) => acc + (Number.isFinite(r.amount) ? r.amount : 0), 0);
}

export type ProcurementProductRowLike = ProcurementRowLike & {
  productName: string;
  sku: string;
  notes: string;
};

/**
 * Zeilen mit Verpackung oder „parts“ (nach Text in Name/SKU/Notiz) zählen nicht zur Produkt-Summe.
 */
export function isProcurementProductLine(row: {
  productName: string;
  sku: string;
  notes: string;
}): boolean {
  const hay = `${row.productName}\n${row.sku}\n${row.notes}`.toLowerCase();
  if (hay.includes("packaging")) return false;
  if (hay.includes("verpackung")) return false;
  if (/\bparts\b/.test(hay)) return false;
  return true;
}

/** Summe nur für Produkt-Zeilen (ohne Packaging/Parts-Zeilen). */
export function groupProductTotalAmount(rows: ProcurementProductRowLike[]): number {
  return rows.reduce((acc, r) => {
    if (!isProcurementProductLine(r)) return acc;
    return acc + (Number.isFinite(r.amount) ? r.amount : 0);
  }, 0);
}

export function containerArrivalUtc(rows: ProcurementRowLike[]): number | null {
  let min: number | null = null;
  for (const r of rows) {
    const ts = parseArrivalUtc(r.arrivalAtPort);
    if (ts == null) continue;
    if (min == null || ts < min) min = ts;
  }
  return min;
}

export function containerArrivalIsUpcoming(rows: ProcurementRowLike[]): boolean {
  const e = containerArrivalUtc(rows);
  return e != null && e >= startOfTodayUtc();
}

export function isoDateFromUtc(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Alle Zeilen eines Containers erhalten dasselbe `arrivalAtPort` (ISO) wie die Gruppe. */
export function rowsWithCanonicalContainerArrival<T extends ProcurementRowLike & Record<string, unknown>>(
  rows: T[]
): T[] {
  const ts = containerArrivalUtc(rows);
  if (ts == null) return rows;
  const iso = isoDateFromUtc(ts);
  return rows.map((r) => ({ ...r, arrivalAtPort: iso }));
}
