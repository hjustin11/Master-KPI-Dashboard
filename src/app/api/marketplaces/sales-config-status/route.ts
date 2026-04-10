import { NextResponse } from "next/server";
import {
  FLEX_MARKETPLACE_EBAY_SPEC,
  FLEX_MARKETPLACE_TIKTOK_SPEC,
  type FlexMarketplaceSpec,
  flexMissingKeysForConfig,
  getFlexIntegrationConfig,
} from "@/shared/lib/flexMarketplaceApiClient";

async function resolveConfigured(spec: FlexMarketplaceSpec) {
  const config = await getFlexIntegrationConfig(spec);
  const missingKeys = flexMissingKeysForConfig(config)
    .filter((entry) => entry.missing)
    .map((entry) => entry.key);
  return {
    configured: missingKeys.length === 0,
    missingKeys,
  };
}

export async function GET() {
  try {
    const [ebay, tiktok] = await Promise.all([
      resolveConfigured(FLEX_MARKETPLACE_EBAY_SPEC),
      resolveConfigured(FLEX_MARKETPLACE_TIKTOK_SPEC),
    ]);

    return NextResponse.json({
      ebay,
      tiktok,
    });
  } catch {
    return NextResponse.json(
      {
        error: "config_status_unavailable",
      },
      { status: 500 }
    );
  }
}
