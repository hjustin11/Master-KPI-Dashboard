/**
 * Deep-Link zur Xentral-Web-Oberfläche (Sales Order).
 * Zwei Modi (XENTRAL_SALES_ORDER_WEB_PATH):
 * - Relativer Pfad + XENTRAL_APP_BASE_URL / API-Ableitung: `{base}{path}/{id}` (klassische SPA).
 * - Vollständige https-URL endend mit `…id=` — nur die Auftrags-ID wird angehängt (Xentral Next u. ä.).
 */

/** API-Basis-URL (…/api/v1) → typische Browser-Basis ohne /api[-Suffix]. */
export function deriveXentralAppBaseFromApiBase(apiBase: string): string {
  return apiBase.replace(/\/+$/, "").replace(/\/api(?:\/v\d+)?$/i, "");
}

export function isXentralSalesOrderAbsoluteUrlTemplate(pathOrUrl: string): boolean {
  return /^https?:\/\//i.test(pathOrUrl.trim());
}

export function xentralSalesOrderDetailUrl(args: {
  webBase: string | null;
  pathPrefix: string;
  salesOrderId: string;
}): string {
  const path = args.pathPrefix.trim();
  const id = encodeURIComponent(args.salesOrderId.trim());
  if (isXentralSalesOrderAbsoluteUrlTemplate(path)) {
    return `${path.replace(/\/+$/, "")}${id}`;
  }
  const base = (args.webBase ?? "").replace(/\/+$/, "");
  const pathNorm = path.startsWith("/") ? path : `/${path}`;
  return `${base}${pathNorm}/${id}`;
}
