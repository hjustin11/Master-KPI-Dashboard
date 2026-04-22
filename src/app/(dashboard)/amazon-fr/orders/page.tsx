"use client";

import { AmazonOrdersView } from "@/shared/components/AmazonOrdersView";

export default function AmazonFrOrdersPage() {
  return (
    <AmazonOrdersView
      apiUrl="/api/amazon/amazon-fr/orders"
      cacheKey="amazon_fr_orders_accumulated_v1"
      title="Amazon FR · Bestellungen"
      cacheRefreshMarketplace="amazon-fr"
    />
  );
}
