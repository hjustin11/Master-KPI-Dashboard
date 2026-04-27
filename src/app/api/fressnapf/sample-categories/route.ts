import { NextResponse } from "next/server";
import { getFressnapfIntegrationConfig } from "@/shared/lib/fressnapfApiClient";
import { withAuth } from "@/shared/lib/apiAuth";

/**
 * Sample-Endpoint: holt 20 existierende Fressnapf-Produkte und extrahiert
 * deren tatsächlich akzeptierte Category-Codes. **Owner/Admin only** —
 * leakt Mirakl-Config + Produktdaten.
 *
 * Nutzung:
 *   /api/fressnapf/sample-categories
 */
export const GET = withAuth(async () => {
  const cfg = await getFressnapfIntegrationConfig();
  if (!cfg.apiKey || !cfg.baseUrl) {
    return NextResponse.json({ error: "Fressnapf API nicht konfiguriert." }, { status: 500 });
  }
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.authMode === "x-api-key") headers["X-API-Key"] = cfg.apiKey;
  else if (cfg.authMode === "bearer") headers.Authorization = `Bearer ${cfg.apiKey}`;
  else headers.Authorization = cfg.apiKey;

  const probe = async (path: string) => {
    try {
      const res = await fetch(`${base}${path}`, { method: "GET", headers, cache: "no-store" });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text.slice(0, 1000);
      }
      return { path, status: res.status, json };
    } catch (e) {
      return { path, error: e instanceof Error ? e.message : String(e) };
    }
  };

  // Verschiedene Pfade probieren — wir wissen nicht welcher funktioniert
  const attempts = await Promise.all([
    probe("/api/products?max=20"),
    probe("/api/products"),
    probe("/api/offers?max=20"),
    probe("/api/offers"),
    probe("/api/shop/offers?max=20"),
  ]);

  // Aus der ersten erfolgreichen Response die category-Werte extrahieren
  const extracted: { path: string; categoriesFound: string[]; count: number }[] = [];
  for (const attempt of attempts) {
    if ("error" in attempt || attempt.status !== 200) continue;
    const json = attempt.json;
    if (!json || typeof json !== "object") continue;
    const items = Array.isArray((json as { products?: unknown }).products)
      ? (json as { products: unknown[] }).products
      : Array.isArray((json as { offers?: unknown }).offers)
        ? (json as { offers: unknown[] }).offers
        : Array.isArray(json)
          ? json as unknown[]
          : [];
    if (items.length === 0) continue;
    const cats = new Set<string>();
    const fullSamples: Record<string, unknown>[] = [];
    for (let i = 0; i < Math.min(5, items.length); i += 1) {
      const p = items[i];
      if (p && typeof p === "object") fullSamples.push(p as Record<string, unknown>);
    }
    for (const p of items) {
      if (!p || typeof p !== "object") continue;
      const o = p as Record<string, unknown>;
      for (const key of ["category", "category_code", "hierarchy", "category_label", "category_id"]) {
        const v = o[key];
        if (v && typeof v === "string") cats.add(`${key}=${v}`);
      }
    }
    extracted.push({
      path: attempt.path,
      categoriesFound: Array.from(cats),
      count: items.length,
    });
  }

  return NextResponse.json({
    baseUrl: base,
    authMode: cfg.authMode,
    extracted,
    fullProbeResults: attempts,
  });
}, { requiredRole: ["owner", "admin"] });
