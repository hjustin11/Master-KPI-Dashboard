import { NextResponse } from "next/server";
import {
  ensureOttoAvailabilityScope,
  ensureOttoProductsScope,
  fetchOttoAvailabilityQuantitiesAll,
  fetchOttoProductsAll,
  getOttoAccessToken,
  getOttoIntegrationConfig,
} from "@/shared/lib/ottoApiClient";
import { INTEGRATION_SECRETS_CONFIGURATION_HINT_DE } from "@/shared/lib/integrationSecrets";
import type { MarketplaceProductsListResponse } from "@/shared/lib/marketplaceProductList";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = false;
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
          hint: INTEGRATION_SECRETS_CONFIGURATION_HINT_DE,
          integrationSecretsLoadErrors: config.integrationSecretsLoadErrors,
        } satisfies MarketplaceProductsListResponse,
        { status: 500 }
      );
    }

    const scopes = ensureOttoAvailabilityScope(ensureOttoProductsScope(config.scopes));
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

    const [list, availabilityBySku] = await Promise.all([
      fetchOttoProductsAll({
        baseUrl: config.baseUrl,
        token,
        productsPath,
        forceRefresh,
      }),
      fetchOttoAvailabilityQuantitiesAll({
        baseUrl: config.baseUrl,
        token,
        forceRefresh,
      }),
    ]);

    const items = list.map((r) => {
      const skuKey = r.sku.trim().toLowerCase();
      return {
        sku: r.sku,
        secondaryId: r.secondaryId,
        title: r.title,
        statusLabel: r.statusLabel,
        isActive: r.isActive,
        ...(r.priceEur != null ? { priceEur: r.priceEur } : {}),
        stockQty: availabilityBySku.get(skuKey) ?? null,
        ...(r.extras && Object.keys(r.extras).length > 0 ? { extras: r.extras } : {}),
      };
    });

    return NextResponse.json({ items } satisfies MarketplaceProductsListResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json(
      {
        error: message,
        items: [],
        hint:
          "OTTO-Produktpfad wird automatisch über /v5/products (Fallback: /v4,/v3) versucht. Optional OTTO_PRODUCTS_PATH setzen. Außerdem Scopes „products availability“ in OTTO_API_SCOPES aktivieren.",
      } satisfies MarketplaceProductsListResponse,
      { status: 502 }
    );
  }
}
