"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";

export default function AmazonProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl={(status) => `/api/amazon/products?status=${status}`}
      cacheKey={(status) => `amazon_products_cache_v2:${status}`}
      logoSrc="https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg"
      brandAlt="Amazon"
      amazonStatusFilter
      serverPagination
      pageSize={50}
      backgroundSyncIntervalMs={15 * 60 * 1000}
    />
  );
}
