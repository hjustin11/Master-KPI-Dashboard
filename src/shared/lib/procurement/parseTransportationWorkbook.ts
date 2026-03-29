import * as XLSX from "xlsx";

/** Nur dieses Tabellenblatt wird importiert (Transportation-Excel). */
export const PROCUREMENT_WORKBOOK_SHEET = "2026";

export type ParsedProcurementLine = {
  containerNumber: string;
  manufacture: string;
  productName: string;
  sku: string;
  amount: number;
  arrivalAtPort: string;
  notes: string;
};

function normHeader(cell: unknown): string {
  return String(cell ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

type ColKey = "manufacture" | "container" | "product" | "sku" | "amount" | "arrival" | "notes";

/** Erkennt Spalten unabhängig von Groß/Klein (DE/EN-Header). */
function buildColumnIndex(headerRow: unknown[]): Partial<Record<ColKey, number>> {
  const out: Partial<Record<ColKey, number>> = {};

  for (let i = 0; i < headerRow.length; i++) {
    const h = normHeader(headerRow[i]);
    if (!h) continue;

    if (out.manufacture == null) {
      if (h === "manufacture" || h === "hersteller" || h === "manufacturer") out.manufacture = i;
    }
    if (out.container == null) {
      if (
        h === "container number" ||
        h === "containernummer" ||
        h === "container-nr" ||
        h === "container nr" ||
        h === "container"
      ) {
        out.container = i;
      }
    }
    if (out.product == null) {
      if (h === "product name" || h === "produktname" || h === "artikelname" || h === "product") {
        out.product = i;
      }
    }
    if (out.sku == null && h === "sku") out.sku = i;
    if (out.amount == null) {
      if (h === "amount" || h === "menge" || h === "quantity" || h === "qty") out.amount = i;
    }
    if (out.arrival == null) {
      if (
        h === "time of arrival at port" ||
        h.includes("arrival at port") ||
        h.includes("lieferzeitpunkt") ||
        h.includes("ankunft") ||
        h === "eta"
      ) {
        out.arrival = i;
      }
    }
    if (out.notes == null) {
      if (h === "notes" || h === "notiz" || h === "notizen" || h === "bemerkung") out.notes = i;
    }
  }

  return out;
}

function parseArrivalCell(val: unknown): string {
  if (val == null || val === "") return "";
  if (typeof val === "number" && val > 20000 && val < 80000) {
    const d = XLSX.SSF.parse_date_code(val);
    if (d && d.y != null && d.m != null && d.d != null) {
      const mm = String(d.m).padStart(2, "0");
      const dd = String(d.d).padStart(2, "0");
      return `${d.y}-${mm}-${dd}`;
    }
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function parseAmount(val: unknown): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const s = String(val).trim().replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function cell(row: unknown[], idx: number | undefined): string {
  if (idx == null || idx < 0) return "";
  const v = row[idx];
  if (v == null) return "";
  return String(v).trim();
}

export function parseTransportationWorkbook(workbook: XLSX.WorkBook): ParsedProcurementLine[] {
  const sheetName = workbook.SheetNames.find((n) => n.trim() === PROCUREMENT_WORKBOOK_SHEET);
  if (!sheetName) {
    return [];
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  if (rows.length === 0) {
    return [];
  }

  const out: ParsedProcurementLine[] = [];
  let lastManufacture = "";
  let lastContainer = "";

  let col: ReturnType<typeof buildColumnIndex> = {};
  let start = 0;
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const c = buildColumnIndex(rows[r] ?? []);
    if (c.sku !== undefined && c.container !== undefined) {
      col = c;
      start = r + 1;
      break;
    }
  }

  if (col.sku === undefined || col.container === undefined) {
    return [];
  }

  for (let r = start; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const sku = cell(row, col.sku);
    const productName = col.product !== undefined ? cell(row, col.product) : "";
    const amount = col.amount !== undefined ? parseAmount(row[col.amount]) : 0;
    const notesRaw = cell(row, col.notes);
    const notes = notesRaw.replace(/\r\n/g, "\n").trim();

    const mfgCell = cell(row, col.manufacture);
    const cntCell = cell(row, col.container);

    if (mfgCell) lastManufacture = mfgCell;
    if (cntCell) lastContainer = cntCell;

    const manufacture = mfgCell || lastManufacture;
    const containerNumber = cntCell || lastContainer;

    const arrivalRaw = col.arrival !== undefined ? row[col.arrival] : "";
    const arrivalAtPort = parseArrivalCell(arrivalRaw);

    const rowHasContent =
      sku ||
      productName ||
      amount !== 0 ||
      notes ||
      mfgCell ||
      cntCell ||
      arrivalAtPort;

    if (!rowHasContent) continue;

    out.push({
      containerNumber,
      manufacture,
      productName,
      sku,
      amount,
      arrivalAtPort,
      notes,
    });
  }

  return out;
}

export function readWorkbookFromBuffer(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: "buffer" });
}
