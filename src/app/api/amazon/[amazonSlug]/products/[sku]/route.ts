import { NextResponse } from "next/server";
import { GET as skuHandler } from "@/app/api/amazon/products/[sku]/route";
import { getAmazonMarketplaceBySlug } from "@/shared/config/amazonMarketplaces";

export const maxDuration = 120;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ amazonSlug: string; sku: string }> }
) {
  const { amazonSlug, sku } = await params;
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
  return skuHandler(forwarded, { params: Promise.resolve({ sku }) });
}
