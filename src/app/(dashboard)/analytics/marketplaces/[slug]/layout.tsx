import { notFound } from "next/navigation";
import { AnalyticsMarketplaceSubnav } from "@/shared/components/layout/AnalyticsMarketplaceSubnav";
import { ANALYTICS_MARKETPLACES, getMarketplaceBySlug } from "@/shared/lib/analytics-marketplaces";
import { DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";

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
    <div className="space-y-4 text-sm leading-snug">
      <div className="space-y-0.5">
        <h1 className={DASHBOARD_PAGE_TITLE}>{marketplace.label}</h1>
        <p className="text-xs text-muted-foreground">
          Gleiche Unterteilung wie bei Amazon – kompakt im Seitenkopf statt in der Sidebar.
        </p>
      </div>
      <AnalyticsMarketplaceSubnav slug={slug} />
      <div className="min-h-[160px]">{children}</div>
    </div>
  );
}

export function generateStaticParams() {
  return ANALYTICS_MARKETPLACES.map((m) => ({ slug: m.slug }));
}
