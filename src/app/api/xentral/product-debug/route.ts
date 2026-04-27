import { NextResponse } from "next/server";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import { withAuth } from "@/shared/lib/apiAuth";

/**
 * Debug-Endpunkt: gibt die rohen Responses aller relevanten Xentral-Sub-Resources
 * für eine Produkt-ID zurück. **Owner/Admin only** — leakt Xentral-PAT-Wirkung
 * + Produkt-Stammdaten.
 *
 * Nutzung: /api/xentral/product-debug?id=XXXX
 */
export const GET = withAuth(async ({ req: request }) => {
  const { searchParams } = new URL(request.url);
  const productId = (searchParams.get("id") ?? "").trim();
  const sku = (searchParams.get("sku") ?? "").trim();

  if (!productId && !sku) {
    return NextResponse.json({ error: "id oder sku required" }, { status: 400 });
  }

  const baseUrl = await getIntegrationSecretValue("XENTRAL_BASE_URL");
  const token =
    (await getIntegrationSecretValue("XENTRAL_PAT")) ||
    (await getIntegrationSecretValue("XENTRAL_KEY"));
  if (!baseUrl || !token) {
    return NextResponse.json({ error: "Xentral config missing" }, { status: 500 });
  }

  const base = baseUrl.replace(/\/+$/, "");
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };

  const fetchAndParse = async (path: string) => {
    try {
      const res = await fetch(`${base}${path}`, { method: "GET", headers, cache: "no-store" });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text.slice(0, 2000);
      }
      return { path, status: res.status, json };
    } catch (e) {
      return { path, error: e instanceof Error ? e.message : String(e) };
    }
  };

  let idToUse = productId;
  if (!idToUse && sku) {
    // Find id by SKU via list
    const lookupUrl = new URL(`${base}/api/v1/products`);
    lookupUrl.searchParams.set("page[number]", "1");
    lookupUrl.searchParams.set("page[size]", "10");
    lookupUrl.searchParams.set("filter[0][key]", "number");
    lookupUrl.searchParams.set("filter[0][op]", "equals");
    lookupUrl.searchParams.set("filter[0][value]", sku);
    const res = await fetch(lookupUrl.toString(), { method: "GET", headers, cache: "no-store" });
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { data?: Array<{ id?: string }> };
      idToUse = String(json.data?.[0]?.id ?? "");
    } catch {
      return NextResponse.json({ error: "list lookup failed", raw: text.slice(0, 2000) });
    }
    if (!idToUse) {
      return NextResponse.json({ error: `SKU ${sku} not found in Xentral` });
    }
  }

  // Fetch all probable sub-resources in parallel
  const paths = [
    `/api/v1/products/${encodeURIComponent(idToUse)}`,
    `/api/v1/products/${encodeURIComponent(idToUse)}/stocksettings`,
    `/api/v1/products/${encodeURIComponent(idToUse)}/manufacturerinformation`,
    `/api/v1/products/${encodeURIComponent(idToUse)}/productinformation`,
    `/api/v1/products/${encodeURIComponent(idToUse)}/productdimensions`,
    `/api/v1/products/${encodeURIComponent(idToUse)}/dimensions`,
    `/api/v1/products/${encodeURIComponent(idToUse)}/purchaseinformation`,
    `/api/v1/products/${encodeURIComponent(idToUse)}/salesinformation`,
    `/api/v1/products/${encodeURIComponent(idToUse)}/specificcharacteristic`,
    `/api/v1/products/${encodeURIComponent(idToUse)}/productcharacteristic`,
  ];
  const results = await Promise.all(paths.map(fetchAndParse));
  return NextResponse.json({ productId: idToUse, results });
}, { requiredRole: ["owner", "admin"] });
