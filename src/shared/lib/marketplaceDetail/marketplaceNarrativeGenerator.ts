import type { MarketplaceOverviewData } from "@/shared/hooks/useMarketplaceDetail";
import type { ProductsData } from "@/shared/hooks/useMarketplaceProducts";

function fmtEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)} %`;
}

export function generateNarrative(data: MarketplaceOverviewData, products?: ProductsData | null): string {
  const { marketplace, totals, deltas } = data;
  const parts: string[] = [];

  // Satz 1: Gesamtergebnis
  const deltaStr = deltas.grossSales !== null ? ` (${fmtPct(deltas.grossSales)} ggü. Vorperiode)` : "";
  parts.push(`${marketplace.name} erzielte einen Bruttoumsatz von ${fmtEur(totals.grossSales)}${deltaStr}.`);

  // Satz 2: Haupttreiber aus Produktdaten ODER Bestellungen
  const losers = products?.products.filter((p) => p.status === "losing_ground") ?? [];
  const newcomers = products?.products.filter((p) => p.status === "newcomer") ?? [];

  if (losers.length > 0 && deltas.grossSales !== null && deltas.grossSales < -15) {
    const topLoser = losers[0];
    const totalLost = losers.reduce((s, p) => s + (p.revenuePrevious - p.revenueCurrent), 0);
    parts.push(`Der Rückgang wird durch ${losers.length} einbrechende Produkte dominiert (−${fmtEur(totalLost)}), allen voran ${topLoser.name} (${topLoser.deltaPct.toFixed(0)} %).`);
  } else if (deltas.orders !== null && Math.abs(deltas.orders) > 5) {
    const dir = deltas.orders > 0 ? "gestiegen" : "gesunken";
    parts.push(`Die Bestellungen sind um ${Math.abs(deltas.orders).toFixed(0)} % ${dir} (${totals.orders} Bestellungen, Ø ${fmtEur(totals.avgOrderValue)}).`);
  } else {
    parts.push(`Es gingen ${totals.orders} Bestellungen ein (Ø ${fmtEur(totals.avgOrderValue)} pro Bestellung).`);
  }

  // Satz 3: Positiver Akzent oder Risiko
  if (newcomers.length > 0) {
    const totalNew = newcomers.reduce((s, p) => s + p.revenueCurrent, 0);
    parts.push(`Positiv: ${newcomers.length} Newcomer erreichten ${fmtEur(totalNew)} Umsatz.`);
  } else if (totals.returnRate > 0.10) {
    parts.push(`Die Retourenquote liegt bei ${(totals.returnRate * 100).toFixed(1)} % — Handlungsbedarf.`);
  } else if (totals.adSpend > 0 && totals.grossSales > 0) {
    const tacos = (totals.adSpend / totals.grossSales) * 100;
    parts.push(`Die Werbekosten betragen ${fmtEur(totals.adSpend)} (TACOS: ${tacos.toFixed(1)} %).`);
  }

  // Satz 4: Netto
  if (totals.netPayout > 0) {
    const payoutRate = totals.grossSales > 0 ? (totals.netPayout / totals.grossSales) * 100 : 0;
    parts.push(`Die Netto-Auszahlung beträgt ${fmtEur(totals.netPayout)} (${payoutRate.toFixed(0)} % vom Brutto).`);
  }

  return parts.join(" ");
}
