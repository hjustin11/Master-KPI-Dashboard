import * as XLSX from "xlsx";

export type ArticleForecastExportRow = {
  sku: string;
  name: string;
  sold: number;
  stock: number;
  dailySold: number;
  projected: number;
};

export function downloadArticleForecastExcel(
  rows: ArticleForecastExportRow[],
  filename: string,
  sheetName: string,
  headers: string[]
): void {
  const aoa: (string | number)[][] = [
    headers,
    ...rows.map((r) => [r.sku, r.name, r.sold, r.stock, r.dailySold, r.projected]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
