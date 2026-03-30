import { NextResponse } from "next/server";
import {
  ensureOttoProductsScope,
  fetchOttoProductsAll,
  getOttoAccessToken,
  getOttoIntegrationConfig,
} from "@/shared/lib/ottoApiClient";
import type { MarketplaceProductsListResponse } from "@/shared/lib/marketplaceProductList";

export async function GET() {
  try {
    const config = await getOttoIntegrationConfig();
    const missing = {
      OTTO_API_CLIENT_ID: !config.clientId,
      OTTO_API_CLIENT_SECRET: !config.clientSecret,
    };
    if (Object.values(missing).some(Boolean)) {
      return NextResponse.json(
        {
          error: "Otto API ist nicht vollständig konfiguriert.",
          missingKeys: Object.entries(missing)
            .filter(([, v]) => v)
            .map(([k]) => k),
        } satisfies MarketplaceProductsListResponse,
        { status: 500 }
      );
    }

    const scopes = ensureOttoProductsScope(config.scopes);
    const token = await getOttoAccessToken({
      baseUrl: config.baseUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scopes,
    });

    const productsPathRaw = (process.env.OTTO_PRODUCTS_PATH ?? "").trim();
    const productsPath = productsPathRaw
      ? productsPathRaw.startsWith("/")
        ? productsPathRaw
        : `/${productsPathRaw}`
      : undefined;

    const list = await fetchOttoProductsAll({
      baseUrl: config.baseUrl,
      token,
      productsPath,
    });

    const items = list.map((r) => ({
      sku: r.sku,
      secondaryId: r.secondaryId,
      title: r.title,
      statusLabel: r.statusLabel,
      isActive: r.isActive,
    }));

    return NextResponse.json({ items } satisfies MarketplaceProductsListResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json(
      {
        error: message,
        items: [],
        hint:
          "OTTO-Produktpfad wird automatisch über /v5/products (Fallback: /v4,/v3) versucht. Optional OTTO_PRODUCTS_PATH setzen. Außerdem Scope „products“ in OTTO_API_SCOPES aktivieren.",
      } satisfies MarketplaceProductsListResponse,
      { status: 502 }
    );
  }
}
