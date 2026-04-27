import { NextResponse } from "next/server";
import {
  getFlexIntegrationConfig,
  FLEX_MARKETPLACE_MMS_SPEC,
} from "@/shared/lib/flexMarketplaceApiClient";
import { withAuth } from "@/shared/lib/apiAuth";

/**
 * Debug: probt 11 Mirakl-Pfade der MediaMarkt/Saturn-API gleichzeitig, um die
 * tatsächliche Category/Hierarchy-Struktur zu ermitteln. **Owner/Admin only**.
 * Nutzung: /api/mediamarkt/categories-debug
 *         /api/mediamarkt/categories-debug?path=/api/products/attributes
 */
export const GET = withAuth(async ({ req: request }) => {
  const cfg = await getFlexIntegrationConfig(FLEX_MARKETPLACE_MMS_SPEC);
  if (!cfg.apiKey || !cfg.baseUrl) {
    return NextResponse.json({ error: "MediaMarkt/Saturn API nicht konfiguriert." }, { status: 500 });
  }
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.authMode === "x-api-key") headers["X-API-Key"] = cfg.apiKey;
  else if (cfg.authMode === "bearer") headers.Authorization = `Bearer ${cfg.apiKey}`;
  else headers.Authorization = cfg.apiKey;

  const paths = [
    "/api/categories",
    "/api/hierarchies",
    "/api/shop/categories",
    "/api/products/categories",
    "/api/values_lists",
    "/api/products/attributes",
    "/api/values_lists?values_list=category",
    "/api/values_lists?values_list=categories",
    "/api/offers?max=10",
    "/api/operator/configuration",
    "/api/shop",
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
}, { requiredRole: ["owner", "admin"] });
