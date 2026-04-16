import { notFound } from "next/navigation";
import { ANALYTICS_MARKETPLACES, getMarketplaceBySlug } from "@/shared/lib/analytics-marketplaces";

export default async function AnalyticsMarketplaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const marketplace = getMarketplaceBySlug(slug);
  if (!marketplace) notFound();

  return <>{children}</>;
}

export function generateStaticParams() {
  return ANALYTICS_MARKETPLACES.map((m) => ({ slug: m.slug }));
}
