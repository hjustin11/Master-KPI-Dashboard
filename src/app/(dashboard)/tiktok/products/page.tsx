"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";

export default function TiktokProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl="/api/tiktok/products"
      cacheKey="tiktok_products_cache_v1"
      logoSrc="/brand/marketplaces/tiktok.svg"
      brandAlt="TikTok"
      subtitleKey="marketplaceProducts.subtitleTiktok"
    />
  );
}
