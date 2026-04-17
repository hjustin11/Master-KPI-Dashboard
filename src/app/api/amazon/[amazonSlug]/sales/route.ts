import { NextResponse } from "next/server";
import { GET as salesHandler } from "@/app/api/amazon/sales/route";
import { getAmazonMarketplaceBySlug } from "@/shared/config/amazonMarketplaces";

export const maxDuration = 120;

/**
 * Dynamischer Forwarder: `/api/amazon/amazon-fr/sales` → `/api/amazon/sales?amazonSlug=amazon-fr`.
 * Die eigentliche Handler-Logik bleibt zentral in `/api/amazon/sales/route.ts`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ amazonSlug: string }> }
) {
  const { amazonSlug } = await params;
  const marketplace = getAmazonMarketplaceBySlug(amazonSlug);
  if (!marketplace) {
    return NextResponse.json(
      { error: `Unbekannter Amazon-Slug: ${amazonSlug}` },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  url.searchParams.set("amazonSlug", amazonSlug);
  const forwarded = new Request(url.toString(), request);
  return salesHandler(forwarded);
}
