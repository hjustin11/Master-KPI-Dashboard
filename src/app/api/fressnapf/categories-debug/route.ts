import { NextResponse } from "next/server";
import { getFressnapfIntegrationConfig } from "@/shared/lib/fressnapfApiClient";

/**
 * Debug: ruft Fressnapfs Mirakl /api/categories ab, damit wir die echten
 * Kategorie-Codes sehen (ohne die der PM01-Upload scheitert).
 * Nutzung: /api/fressnapf/categories-debug
 * Optionaler Filter: ?q=kratz
 */
export async function GET(request: Request) {
  const cfg = await getFressnapfIntegrationConfig();
  if (!cfg.apiKey || !cfg.baseUrl) {
    return NextResponse.json({ error: "Fressnapf API nicht konfiguriert." }, { status: 500 });
  }
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.authMode === "x-api-key") headers["X-API-Key"] = cfg.apiKey;
  else if (cfg.authMode === "bearer") headers.Authorization = `Bearer ${cfg.apiKey}`;
  else headers.Authorization = cfg.apiKey;

  // Mirakl-Endpunkte für Kategorien/Hierarchien — wir probieren mehrere, weil
  // Fressnapf eventuell eigene Routen freigibt/sperrt.
  const paths = [
    "/api/categories",
    "/api/hierarchies",
    "/api/shop/categories",
    "/api/products/categories",
    "/api/values_lists",
    "/api/products/attributes",
    "/api/products/attributes?hierarchy=marketplace_animal_housing",
    "/api/values_lists?values_list=category",
    "/api/values_lists?values_list=categories",
    "/api/products?max=3",
    "/api/operator/configuration",
  ];
  const probe = async (path: string) => {
    try {
      const res = await fetch(`${base}${path}`, { method: "GET", headers, cache: "no-store" });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text.slice(0, 1500);
      }
      return { path, status: res.status, json };
    } catch (e) {
      return { path, error: e instanceof Error ? e.message : String(e) };
    }
  };
  const { searchParams } = new URL(request.url);
  const singlePath = searchParams.get("path");
  if (singlePath) {
    const result = await probe(singlePath);
    return NextResponse.json(result);
  }
  const results = await Promise.all(paths.map(probe));
  return NextResponse.json({ baseUrl: base, authMode: cfg.authMode, results });
}
