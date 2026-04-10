"use client";

import { AmazonRulebookDialog } from "@/app/(dashboard)/amazon/products/AmazonRulebookDialog";
import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";

export default function AmazonProductsPage() {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AmazonRulebookDialog />
      </div>
      <MarketplaceProductsView
        apiUrl={(status) => `/api/amazon/products?status=${status}&all=1`}
        cacheKey={(status) => `amazon_products_cache_v2:${status}`}
        logoSrc="https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg"
        brandAlt="Amazon"
        marketplaceSlug="amazon"
        amazonStatusFilter
        enableAmazonEditor
        dataTablePaginate={false}
        backgroundSyncIntervalMs={15 * 60 * 1000}
      />
    </div>
  );
}
