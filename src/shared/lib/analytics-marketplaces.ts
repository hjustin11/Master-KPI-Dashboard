export const ANALYTICS_MARKETPLACES = [
  { slug: "otto", label: "Otto", logo: "/brand/marketplaces/otto.svg" },
  { slug: "ebay", label: "eBay", logo: "/brand/marketplaces/ebay.svg" },
  { slug: "kaufland", label: "Kaufland", logo: "/brand/marketplaces/kaufland.svg" },
  { slug: "fressnapf", label: "Fressnapf", logo: "/brand/marketplaces/fressnapf.svg" },
  {
    slug: "mediamarkt-saturn",
    label: "MediaMarkt & Saturn",
    logo: "/brand/marketplaces/mediamarkt-saturn.svg",
  },
  { slug: "zooplus", label: "ZooPlus", logo: "/brand/marketplaces/zooplus.svg" },
  { slug: "tiktok", label: "TikTok", logo: "/brand/marketplaces/tiktok.svg" },
  { slug: "shopify", label: "Shopify", logo: "/brand/marketplaces/shopify.svg" },
] as const;

export type AnalyticsMarketplaceSlug = (typeof ANALYTICS_MARKETPLACES)[number]["slug"];

export type AnalyticsMarketplace = (typeof ANALYTICS_MARKETPLACES)[number];

export function getMarketplaceBySlug(slug: string): AnalyticsMarketplace | undefined {
  return ANALYTICS_MARKETPLACES.find((m) => m.slug === slug);
}
