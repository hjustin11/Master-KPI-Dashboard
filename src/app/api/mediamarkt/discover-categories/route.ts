import { NextResponse } from "next/server";
import {
  getFlexIntegrationConfig,
  FLEX_MARKETPLACE_MMS_SPEC,
} from "@/shared/lib/flexMarketplaceApiClient";

/**
 * Aggressive MMS Category-Discovery: paginiert durch alle Offers, probt
 * values_lists + products/attributes, um möglichst viele Kategorie-Pfade zu
 * finden, die MMS als gültig akzeptiert.
 *
 * Nutzung: /api/mediamarkt/discover-categories
 *          /api/mediamarkt/discover-categories?search=kratz
 *
 * Gibt alle gefundenen Pfade sortiert + (bei ?search=) nur die, die das
 * Such-Keyword enthalten.
 */
export async function GET(request: Request) {
  const cfg = await getFlexIntegrationConfig(FLEX_MARKETPLACE_MMS_SPEC);
  if (!cfg.apiKey || !cfg.baseUrl) {
    return NextResponse.json({ error: "MediaMarkt/Saturn API nicht konfiguriert." }, { status: 500 });
  }
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.authMode === "x-api-key") headers["X-API-Key"] = cfg.apiKey;
  else if (cfg.authMode === "bearer") headers.Authorization = `Bearer ${cfg.apiKey}`;
  else headers.Authorization = cfg.apiKey;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.toLowerCase() ?? "";
  const maxPages = Number(searchParams.get("maxPages") ?? "10");

  const allPaths = new Set<string>();
  const internalCodes = new Set<string>();
  const probedUrls: Array<{ url: string; status: number; itemsFound: number }> = [];

  const probe = async (path: string): Promise<unknown> => {
    try {
      const res = await fetch(`${base}${path}`, { method: "GET", headers, cache: "no-store" });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* nicht-JSON ignorieren */
      }
      return { status: res.status, json };
    } catch {
      return { status: 0, json: null };
    }
  };

  // 1) Alle Offers paginiert durchgehen (max `maxPages` Seiten à 100)
  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * 100;
    const result = (await probe(`/api/offers?max=100&offset=${offset}`)) as {
      status: number;
      json: unknown;
    };
    if (result.status !== 200 || !result.json) {
      probedUrls.push({ url: `/api/offers?max=100&offset=${offset}`, status: result.status, itemsFound: 0 });
      break;
    }
    const offers = Array.isArray((result.json as { offers?: unknown }).offers)
      ? ((result.json as { offers: unknown[] }).offers)
      : [];
    probedUrls.push({ url: `/api/offers?max=100&offset=${offset}`, status: 200, itemsFound: offers.length });
    for (const o of offers) {
      if (!o || typeof o !== "object") continue;
      const obj = o as Record<string, unknown>;
      for (const key of ["category", "category_code", "category_label", "hierarchy", "category_path"]) {
        const v = obj[key];
        if (typeof v === "string" && v.trim()) {
          if (/\/|\|/.test(v)) allPaths.add(v.trim());
          else if (/^FET_/.test(v)) internalCodes.add(v.trim());
        }
      }
    }
    if (offers.length < 100) break;
  }

  // 2) Values-Lists — manche Mirakl-Operatoren exponieren Kategorien hier
  for (const listName of ["category", "categories", "product_category", "hierarchy", "shop_category"]) {
    const result = (await probe(`/api/values_lists?values_list=${listName}`)) as {
      status: number;
      json: unknown;
    };
    if (result.status === 200 && result.json) {
      const values = (result.json as { values?: unknown[] }).values;
      if (Array.isArray(values)) {
        for (const v of values) {
          if (!v || typeof v !== "object") continue;
          const vo = v as Record<string, unknown>;
          const label = typeof vo.label === "string" ? vo.label : "";
          const code = typeof vo.code === "string" ? vo.code : "";
          if (label && /\/|\|/.test(label)) allPaths.add(label);
          if (code && /\/|\|/.test(code)) allPaths.add(code);
          if (code && /^FET_/.test(code)) internalCodes.add(code);
        }
        probedUrls.push({
          url: `/api/values_lists?values_list=${listName}`,
          status: 200,
          itemsFound: values.length,
        });
      }
    }
  }

  // 3) Attributes-Endpoint — jedes Attribut kann einen Pfad-Wert enthalten
  //    (MMS liefert ~43k Attribute mit label/code). Wir greppen STRUKTURELL
  //    durch alle Strings und sammeln alle, die wie ein Pfad aussehen.
  const attrsResult = (await probe("/api/products/attributes")) as { status: number; json: unknown };
  const attrsSampleCategoryCodes: Array<{ code: string; label: string; valuesCount?: number }> = [];
  if (attrsResult.status === 200 && attrsResult.json) {
    const attrs = Array.isArray((attrsResult.json as { attributes?: unknown }).attributes)
      ? ((attrsResult.json as { attributes: unknown[] }).attributes)
      : Array.isArray(attrsResult.json)
        ? (attrsResult.json as unknown[])
        : [];

    // Rekursiver String-Grep: kandidiert echte Kategorie-Pfade heuristisch.
    // Category-Pfad sieht aus wie: UPPERCASE_TOPLEVEL / SUBLEVEL / LEAF
    // oder Handelsware|Xxxx. Kein Produkt-Spec-Noise (Zahlen, Einheiten).
    const CATEGORY_PATH_REGEX = /^[A-ZÄÖÜ][\wÄÖÜß &-]{2,40}(\s*\/\s*[A-ZÄÖÜ][\wÄÖÜß &-]{2,40}){1,4}$|^Handelsware\|[\wÄÖÜäöüß -]+$/;
    const scan = (v: unknown): void => {
      if (!v) return;
      if (typeof v === "string") {
        const s = v.trim();
        if (CATEGORY_PATH_REGEX.test(s)) allPaths.add(s);
        return;
      }
      if (Array.isArray(v)) {
        for (const it of v) scan(it);
        return;
      }
      if (typeof v === "object") {
        for (const val of Object.values(v as Record<string, unknown>)) scan(val);
      }
    };
    scan(attrs);

    // Zusätzlich: sampelt Attribute, die wie "Kategorie" / "Hierarchy" aussehen,
    // damit wir sehen, welche Attribut-Codes MMS für Kategorien nutzt.
    for (const a of attrs) {
      if (!a || typeof a !== "object") continue;
      const ao = a as Record<string, unknown>;
      const code = String(ao.code ?? "");
      const label = String(ao.label ?? ao.name ?? "");
      if (
        /category|categor|hierarchy|klassifik|branch|sparte|sortiment/i.test(`${code} ${label}`)
      ) {
        const values = Array.isArray(ao.values) ? ao.values : [];
        attrsSampleCategoryCodes.push({
          code,
          label,
          valuesCount: values.length || undefined,
        });
      }
    }
    probedUrls.push({ url: "/api/products/attributes", status: 200, itemsFound: attrs.length });
  }

  // 4) Öffentlicher Mirakl-Produkt-Katalog (anderer Seller) — Pagination bis 500
  for (let page = 0; page < 5; page += 1) {
    const offset = page * 100;
    const res = (await probe(`/api/products?max=100&offset=${offset}`)) as {
      status: number;
      json: unknown;
    };
    if (res.status !== 200 || !res.json) {
      probedUrls.push({ url: `/api/products?max=100&offset=${offset}`, status: res.status, itemsFound: 0 });
      break;
    }
    const products = Array.isArray((res.json as { products?: unknown }).products)
      ? ((res.json as { products: unknown[] }).products)
      : [];
    probedUrls.push({ url: `/api/products?max=100&offset=${offset}`, status: 200, itemsFound: products.length });
    for (const p of products) {
      if (!p || typeof p !== "object") continue;
      const po = p as Record<string, unknown>;
      for (const key of ["category", "category_code", "hierarchy", "category_label", "category_path"]) {
        const v = po[key];
        if (typeof v === "string" && /\s\/\s|\|/.test(v)) allPaths.add(v.trim());
      }
    }
    if (products.length < 100) break;
  }

  // 5) Spezifischer Search-Endpoint für Kratz-Produkte
  const searchKratz = (await probe("/api/products?max=100&search=kratz")) as {
    status: number;
    json: unknown;
  };
  probedUrls.push({
    url: "/api/products?max=100&search=kratz",
    status: searchKratz.status,
    itemsFound:
      searchKratz.json && typeof searchKratz.json === "object"
        ? (Array.isArray((searchKratz.json as { products?: unknown }).products)
            ? (searchKratz.json as { products: unknown[] }).products.length
            : 0)
        : 0,
  });
  if (searchKratz.status === 200 && searchKratz.json) {
    const products = Array.isArray((searchKratz.json as { products?: unknown }).products)
      ? ((searchKratz.json as { products: unknown[] }).products)
      : [];
    for (const p of products) {
      if (!p || typeof p !== "object") continue;
      const po = p as Record<string, unknown>;
      for (const key of ["category", "category_code", "hierarchy", "category_label", "category_path"]) {
        const v = po[key];
        if (typeof v === "string" && /\s\/\s|\|/.test(v)) allPaths.add(v.trim());
      }
    }
  }

  const pathsArr = Array.from(allPaths).sort();
  const filtered = search ? pathsArr.filter((p) => p.toLowerCase().includes(search)) : pathsArr;

  // Pet-relevante Pfade zuerst — die sind für uns am interessantesten
  const petPaths = pathsArr.filter((p) => /PET|HAUSTIER|PFLEGE|HYGIENE|HANDELSWARE/i.test(p));

  return NextResponse.json({
    baseUrl: base,
    summary: {
      totalPathsFound: pathsArr.length,
      filteredCount: filtered.length,
      petPathsFound: petPaths.length,
      internalCodesFound: internalCodes.size,
      probedEndpoints: probedUrls.length,
      categoryShapedAttributes: attrsSampleCategoryCodes.length,
    },
    petRelevantPaths: petPaths,
    searchFilteredPaths: search ? filtered : undefined,
    samplePaths: pathsArr.slice(0, 30),
    internalCodes: Array.from(internalCodes).sort(),
    categoryShapedAttributes: attrsSampleCategoryCodes.slice(0, 50),
    probedEndpoints: probedUrls,
    hint:
      petPaths.length === 0
        ? `Kein PET/HAUSTIER-Pfad in der API gefunden — MMS exponiert diese Kategorien nicht über /api/products/attributes. Im Backoffice nachschlagen: https://mediamarktsaturn.mirakl.net/mmp/shop/catalog/my-catalog`
        : undefined,
  });
}
