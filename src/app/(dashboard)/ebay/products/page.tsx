"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";

export default function EbayProductsPage() {
  return (
    <MarketplaceProductsView
      serverPagination
      cacheKey={(_s, page) => `ebay_products_cache_v1_p${page ?? 0}`}
      apiUrl="/api/ebay/products"
      logoSrc="/brand/marketplaces/ebay.svg"
      brandAlt="eBay"
    />
  );
}
