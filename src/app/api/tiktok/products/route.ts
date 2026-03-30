import { NextResponse } from "next/server";
import type { MarketplaceProductsListResponse } from "@/shared/lib/marketplaceProductList";

export async function GET() {
  return NextResponse.json(
    {
      items: [],
      error:
        "TikTok-Produktlisten sind in dieser Ansicht noch nicht angebunden (separater Product-API-Endpunkt erforderlich).",
    } satisfies MarketplaceProductsListResponse,
    { status: 501 }
  );
}
