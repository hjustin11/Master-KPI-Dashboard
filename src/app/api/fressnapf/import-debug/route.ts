import { NextResponse } from "next/server";
import { getFressnapfIntegrationConfig } from "@/shared/lib/fressnapfApiClient";
import { withAuth } from "@/shared/lib/apiAuth";

/**
 * Debug-Endpoint: inspiziert einen existierenden Fressnapf-Mirakl-Import
 * (PM01 oder OF01). Liefert Status + Error-Report-Inhalt direkt. **Owner/Admin only**.
 *
 * Nutzung:
 *   /api/fressnapf/import-debug?type=offers&id=5189851
 *   /api/fressnapf/import-debug?type=products&id=5189712
 *
 * `type` = "offers" | "products"
 * `id`   = Mirakl-import_id
 */
export const GET = withAuth(async ({ req: request }) => {
  const cfg = await getFressnapfIntegrationConfig();
  if (!cfg.apiKey || !cfg.baseUrl) {
    return NextResponse.json({ error: "Fressnapf API nicht konfiguriert." }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const typeRaw = (searchParams.get("type") || "offers").toLowerCase();
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Parameter 'id' fehlt. Nutzung: ?type=offers|products&id=<import_id>" },
      { status: 400 }
    );
  }
  if (typeRaw !== "offers" && typeRaw !== "products") {
    return NextResponse.json(
      { error: "Parameter 'type' muss 'offers' oder 'products' sein." },
      { status: 400 }
    );
  }
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "text/csv, text/plain, application/json" };
  if (cfg.authMode === "x-api-key") headers["X-API-Key"] = cfg.apiKey;
  else if (cfg.authMode === "bearer") headers.Authorization = `Bearer ${cfg.apiKey}`;
  else headers.Authorization = cfg.apiKey;

  const basePath = typeRaw === "offers" ? "/api/offers/imports" : "/api/products/imports";
  const probe = async (path: string) => {
    try {
      const res = await fetch(`${base}${path}`, { method: "GET", headers, cache: "no-store" });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text.slice(0, 4000);
      }
      return { path, status: res.status, json };
    } catch (e) {
      return { path, error: e instanceof Error ? e.message : String(e) };
    }
  };

  const [status, errorReport, errorReportFile, errorReportTracking] = await Promise.all([
    probe(`${basePath}/${encodeURIComponent(id)}`),
    probe(`${basePath}/${encodeURIComponent(id)}/error_report`),
    probe(`${basePath}/${encodeURIComponent(id)}/error_report_file`),
    probe(`${basePath}/${encodeURIComponent(id)}/tracking_file`),
  ]);

  return NextResponse.json({
    importType: typeRaw,
    importId: id,
    baseUrl: base,
    status,
    errorReport,
    errorReportFile,
    errorReportTracking,
  });
}, { requiredRole: ["owner", "admin"] });
