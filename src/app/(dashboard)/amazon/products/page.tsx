"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";

export default function AmazonProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl={(status) => `/api/amazon/products?status=${status}`}
      cacheKey={(status) => `amazon_products_cache_v2:${status}`}
      logoSrc="/brand/amazon-logo-current.png"
      brandAlt="Amazon"
      subtitleKey="amazonProducts.subtitle"
      amazonStatusFilter
    />
  );
}
