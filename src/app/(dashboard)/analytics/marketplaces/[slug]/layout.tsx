import { notFound } from "next/navigation";
import { AnalyticsMarketplaceSubnav } from "@/shared/components/layout/AnalyticsMarketplaceSubnav";
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{marketplace.label}</h1>
        <p className="text-sm text-muted-foreground">
          Gleiche Unterteilung wie bei Amazon – kompakt im Seitenkopf statt in der Sidebar.
        </p>
      </div>
      <AnalyticsMarketplaceSubnav slug={slug} />
      <div className="min-h-[200px]">{children}</div>
    </div>
  );
}

export function generateStaticParams() {
  return ANALYTICS_MARKETPLACES.map((m) => ({ slug: m.slug }));
}
