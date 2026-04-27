export type ExportRow = Record<string, string | number | null | undefined>;

function toCell(v: string | number | null | undefined): string | number {
  if (v == null) return "";
  return typeof v === "number" && Number.isFinite(v) ? v : String(v);
}

function buildAoa(columns: string[], rows: ExportRow[]): (string | number)[][] {
  return [columns, ...rows.map((r) => columns.map((c) => toCell(r[c])))];
}

/**
 * XLSX-Export — `xlsx` ist ~800KB minified und wird hier dynamisch geladen,
 * damit Pages (z. B. xentral/products), die nur das CSV-Format brauchen oder
 * gar nichts exportieren, das Bundle nicht tragen müssen.
 */
export async function downloadFullXlsx(
  columns: string[],
  rows: ExportRow[],
  filename: string,
  sheetName: string
): Promise<void> {
  const XLSX = await import("xlsx");
  const aoa = buildAoa(columns, rows);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

function csvEscape(value: string | number | null | undefined, delimiter: string): string {
  if (value == null) return "";
  const s = typeof value === "number" ? String(value) : String(value);
  if (s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadFullCsv(
  columns: string[],
  rows: ExportRow[],
  filename: string
): void {
  const delimiter = ";";
  const lines: string[] = [];
  lines.push(columns.map((c) => csvEscape(c, delimiter)).join(delimiter));
  for (const r of rows) {
    lines.push(columns.map((c) => csvEscape(r[c] ?? "", delimiter)).join(delimiter));
  }
  const content = "﻿" + lines.join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
