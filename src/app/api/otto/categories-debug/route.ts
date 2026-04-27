import { NextResponse } from "next/server";
import {
  ensureOttoProductsScope,
  getOttoAccessToken,
  getOttoIntegrationConfig,
} from "@/shared/lib/ottoApiClient";
import { withAuth } from "@/shared/lib/apiAuth";

export const maxDuration = 120;

/**
 * Otto-Discovery-Endpunkt für Listing-Preparation. **Owner/Admin only** —
 * leakt Otto-API-Konfiguration + Token-Scope-Decode.
 *
 * Query-Modi:
 *   - `?category=Kratzbäume` → matching CategoryGroup inkl. AttributeDefinitions
 *     (mandatory vs. optional). Input kann nur der Kategorie-String sein oder
 *     (vorgestellt) `categoryGroup/category`.
 *   - `?brands=1`            → brands liste (für `brand.not.allowed`-Prevention).
 *   - `?diagnose=1`          → Token-Scope + Path-Probes über v1..v6.
 *   - sonst                  → alle Kategorien (flache Liste `["categoryGroup/category", …]`).
 *
 * Referenz: OTTO_LISTING_UPLOAD.md §4 (AttributeDefinition-Struktur).
 */
export const GET = withAuth(async ({ req: request }) => {
  const cfg = await getOttoIntegrationConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    return NextResponse.json(
      { error: "Otto API nicht konfiguriert (OTTO_API_CLIENT_ID/SECRET)." },
      { status: 500 }
    );
  }
  const scopes = ensureOttoProductsScope(cfg.scopes);
  let token: string;
  try {
    token = await getOttoAccessToken({
      baseUrl: cfg.baseUrl,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      scopes,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Otto token request failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  const { searchParams } = new URL(request.url);
  const wantBrands = searchParams.get("brands") === "1";
  const wantCategory = (searchParams.get("category") ?? "").trim();
  const wantDiagnose = searchParams.get("diagnose") === "1";

  const base = cfg.baseUrl.replace(/\/+$/, "");
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };

  // Diagnose-Modus: testet mehrere Pfad-Varianten + Scope-Inhalt im Token.
  // `GET /api/otto/categories-debug?diagnose=1` — verrät, ob der Products-Scope
  // im Token drin ist und welche Versionen der /products-Routen antworten.
  if (wantDiagnose) {
    const probePaths = [
      "/v1/products",
      "/v2/products",
      "/v3/products",
      "/v4/products",
      "/v5/products",
      "/v6/products",
      "/v5/products/brands",
      "/v5/products/categories?limit=1",
    ];
    const probes = await Promise.all(
      probePaths.map(async (path) => {
        try {
          const r = await fetch(`${base}${path}`, { method: "GET", headers, cache: "no-store" });
          const body = await r.text();
          return { path, status: r.status, bodySnippet: body.slice(0, 200) };
        } catch (e) {
          return { path, error: e instanceof Error ? e.message : String(e) };
        }
      })
    );
    // Token-Inhalt dekodieren (JWT: base64url-Middle-Teil).
    let tokenScopes: string | null = null;
    try {
      const mid = token.split(".")[1];
      if (mid) {
        const pad = mid + "=".repeat((4 - (mid.length % 4)) % 4);
        const decoded = JSON.parse(
          Buffer.from(pad.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
        ) as { scope?: string; scp?: string | string[] };
        tokenScopes = String(decoded.scope ?? decoded.scp ?? "");
      }
    } catch {
      // JWT-Parse fehlgeschlagen — Token ist ggf. opaque; egal.
    }
    return NextResponse.json({
      ok: true,
      baseUrl: base,
      requestedScopes: scopes,
      tokenScopes,
      tokenHint: tokenScopes && !tokenScopes.includes("products")
        ? "Token enthält keinen 'products'-Scope — Otto-Partner-Portal: API-Client öffnen, Products-Kapazität aktivieren, danach neu authentifizieren."
        : null,
      probes,
    });
  }

  if (wantBrands) {
    const url = `${base}/v5/products/brands`;
    const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `HTTP ${res.status}`, raw: text.slice(0, 2000) },
        { status: 502 }
      );
    }
    try {
      const json = JSON.parse(text) as unknown;
      return NextResponse.json({ ok: true, brands: json });
    } catch {
      return NextResponse.json({ error: "Invalid brands JSON.", raw: text.slice(0, 2000) });
    }
  }

  // Alle CategoryGroups paginiert ziehen (Otto: `?limit=100`, Pagination via links.next).
  type CategoryGroup = {
    categoryGroup?: string;
    categories?: string[];
    variationThemes?: string[];
    title?: string;
    attributes?: unknown[];
    additionalRequirements?: unknown[];
    lastModified?: string;
  };
  const allGroups: CategoryGroup[] = [];
  let nextPath: string | null = "/v5/products/categories?limit=100";
  for (let guard = 0; guard < 50 && nextPath; guard++) {
    const url = nextPath.startsWith("http") ? nextPath : `${base}${nextPath}`;
    const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `HTTP ${res.status} on ${nextPath}`, raw: text.slice(0, 1000) },
        { status: 502 }
      );
    }
    const json = (await res.json()) as {
      resources?: CategoryGroup[];
      links?: Array<{ rel?: string; href?: string }>;
    };
    if (Array.isArray(json.resources)) allGroups.push(...json.resources);
    const links = Array.isArray(json.links) ? json.links : [];
    const next = links.find((l) => l?.rel === "next")?.href;
    nextPath = next ?? null;
  }

  if (wantCategory) {
    const match = allGroups.find((g) =>
      (g.categories ?? []).some((c) => c.toLowerCase() === wantCategory.toLowerCase())
    );
    if (!match) {
      const suggestions = allGroups
        .flatMap((g) => g.categories ?? [])
        .filter((c) => c.toLowerCase().includes(wantCategory.toLowerCase()))
        .slice(0, 10);
      return NextResponse.json({
        ok: false,
        error: `Kategorie "${wantCategory}" nicht gefunden.`,
        suggestions,
        totalGroups: allGroups.length,
      });
    }
    return NextResponse.json({ ok: true, categoryGroup: match });
  }

  const flat: string[] = [];
  for (const g of allGroups) {
    const grp = g.categoryGroup ?? "";
    for (const c of g.categories ?? []) flat.push(`${grp}/${c}`);
  }
  flat.sort();
  return NextResponse.json({
    ok: true,
    totalGroups: allGroups.length,
    totalCategories: flat.length,
    categories: flat,
  });
}, { requiredRole: ["owner", "admin"] });
