import { NextResponse } from "next/server";
import { POST as submitHandler } from "@/app/api/amazon/products/[sku]/submit/route";
import { getAmazonMarketplaceBySlug } from "@/shared/config/amazonMarketplaces";

export const maxDuration = 60;

export async function POST(
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

  const bodyText = await request.text();
  const forwardedHeaders = new Headers(request.headers);
  const forwarded = new Request(url.toString(), {
    method: request.method,
    headers: forwardedHeaders,
    body: bodyText,
  });
  return submitHandler(forwarded, { params: Promise.resolve({ sku }) });
}
