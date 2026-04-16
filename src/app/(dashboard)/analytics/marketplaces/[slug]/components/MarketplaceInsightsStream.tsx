"use client";

import { useMemo } from "react";
import type { MarketplaceOverviewData } from "@/shared/hooks/useMarketplaceDetail";
import type { ProductsData } from "@/shared/hooks/useMarketplaceProducts";

type Insight = {
  type: "risk" | "opportunity" | "trend" | "achievement";
  title: string;
  body: string;
};

const TYPE_ICON = { risk: "🚨", opportunity: "✨", trend: "📊", achievement: "🏆" };

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function generateInsights(overview: MarketplaceOverviewData | null, products: ProductsData | null): Insight[] {
  const insights: Insight[] = [];
  if (!overview) return insights;

  const { totals, deltas } = overview;

  // Revenue drop
  if (deltas.grossSales !== null && deltas.grossSales < -20) {
    insights.push({
      type: "risk",
      title: `Umsatz um ${Math.abs(deltas.grossSales).toFixed(0)} % eingebrochen`,
      body: `Bruttoumsatz fiel auf ${formatEur(totals.grossSales)}. Listing-Check und Wettbewerber-Analyse empfohlen.`,
    });
  }

  // High return rate
  if (totals.returnRate > 0.10) {
    insights.push({
      type: "risk",
      title: `Retourenquote bei ${(totals.returnRate * 100).toFixed(1)} %`,
      body: `Überdurchschnittliche Retouren. Kundenbewertungen und Produktqualität prüfen.`,
    });
  }

  // Product losers
  if (products) {
    const losers = products.products.filter((p) => p.status === "losing_ground");
    if (losers.length > 0) {
      const totalLost = losers.reduce((s, p) => s + (p.revenuePrevious - p.revenueCurrent), 0);
      insights.push({
        type: "risk",
        title: `${losers.length} Produkt(e) verlieren stark (−${formatEur(totalLost)})`,
        body: losers.slice(0, 2).map((l) => `${l.name}: ${l.deltaPct.toFixed(0)} %`).join(", "),
      });
    }

    const newcomers = products.products.filter((p) => p.status === "newcomer");
    if (newcomers.length > 0) {
      const totalNew = newcomers.reduce((s, p) => s + p.revenueCurrent, 0);
      insights.push({
        type: "opportunity",
        title: `${newcomers.length} Newcomer mit ${formatEur(totalNew)} Umsatz`,
        body: `Neue Produkte zeigen Potenzial. Werbebudget auf diese SKUs prüfen.`,
      });
    }
  }

  // Growth
  if (deltas.grossSales !== null && deltas.grossSales > 15) {
    insights.push({
      type: "achievement",
      title: `Umsatz um +${deltas.grossSales.toFixed(0)} % gewachsen`,
      body: `Starke Performance — Kurs beibehalten und Lagerbestand sicherstellen.`,
    });
  }

  // AOV trend
  if (deltas.avgOrderValue !== null && Math.abs(deltas.avgOrderValue) > 10) {
    insights.push({
      type: "trend",
      title: `Ø Bestellwert ${deltas.avgOrderValue > 0 ? "gestiegen" : "gesunken"} (${deltas.avgOrderValue > 0 ? "+" : ""}${deltas.avgOrderValue.toFixed(0)} %)`,
      body: deltas.avgOrderValue < 0
        ? "Kunden kaufen günstigere Produkte. Premium-Listings prüfen."
        : "Kunden kaufen höherwertige Produkte — positiver Trend.",
    });
  }

  return insights.slice(0, 5);
}

export function MarketplaceInsightsStream({
  overview,
  products,
  loading,
}: {
  slug: string;
  overview?: MarketplaceOverviewData | null;
  products?: ProductsData | null;
  loading?: boolean;
}) {
  const insights = useMemo(() => generateInsights(overview ?? null, products ?? null), [overview, products]);

  if (loading || insights.length === 0) return null;

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-card">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Automatische Erkenntnisse</p>
      <div className="mt-4 space-y-3">
        {insights.map((ins, i) => (
          <div key={i} className="rounded-lg border-l-4 border-l-black bg-gray-50 p-4 dark:border-l-white dark:bg-gray-800/50">
            <p className="text-sm font-extrabold text-black dark:text-white">
              {TYPE_ICON[ins.type]} {ins.title}
            </p>
            <p className="mt-1 text-xs text-black/70 dark:text-white/70">{ins.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
