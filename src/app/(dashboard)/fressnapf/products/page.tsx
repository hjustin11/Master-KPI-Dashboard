"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";
import {
  DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_MD,
  WIKIMEDIA_FRESSNAPF_LOGO_2023_SVG,
} from "@/shared/lib/dashboardUi";

export default function FressnapfProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl="/api/fressnapf/products"
      cacheKey="fressnapf_products_cache_v1"
      logoSrc={WIKIMEDIA_FRESSNAPF_LOGO_2023_SVG}
      brandAlt="Fressnapf"
      logoFrameClassName={DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_MD}
    />
  );
}
