import type { NextConfig } from "next";

/**
 * Muss mit `src/shared/lib/navSectionRoots.ts` (SECTION_ROOT_REDIRECT_TARGET) übereinstimmen.
 * Kein Import aus `src/`, sonst warnt Turbopack beim Config-Trace.
 */
const SECTION_ROOT_REDIRECTS: Array<{ source: string; destination: string }> = [
  { source: "/amazon", destination: "/amazon/orders" },
  { source: "/ebay", destination: "/ebay/orders" },
  { source: "/otto", destination: "/otto/orders" },
  { source: "/kaufland", destination: "/kaufland/orders" },
  { source: "/fressnapf", destination: "/fressnapf/orders" },
  { source: "/mediamarkt-saturn", destination: "/mediamarkt-saturn/orders" },
  { source: "/zooplus", destination: "/zooplus/orders" },
  { source: "/tiktok", destination: "/tiktok/orders" },
  { source: "/shopify", destination: "/shopify/orders" },
  { source: "/xentral", destination: "/xentral/products" },
  { source: "/advertising", destination: "/advertising/campaigns" },
  { source: "/analytics", destination: "/analytics/marketplaces" },
  { source: "/settings", destination: "/settings/users" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return SECTION_ROOT_REDIRECTS.map((r) => ({
      source: r.source,
      destination: r.destination,
      permanent: false,
    }));
  },
};

export default nextConfig;
