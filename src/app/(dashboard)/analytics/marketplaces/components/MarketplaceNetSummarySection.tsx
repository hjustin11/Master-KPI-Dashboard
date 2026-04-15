"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  calcYoY,
  formatCurrency,
  formatInt,
  formatPercent,
  safePercent,
} from "@/shared/lib/marketplace-analytics-utils";

export type NetSummaryBreakdown = {
  revenue: number;
  orders: number;
  returnsAmount: number;
  returnedAmount: number;
  cancelledAmount: number;
  feesAmount: number;
  adSpendAmount: number;
};

export type NetSummary = {
  current: NetSummaryBreakdown;
  previous: NetSummaryBreakdown;
  currentNet: number;
  previousNet: number;
  currency: string;
  note: string;
};

export function MarketplaceNetSummarySection({
  netSummary,
  intlTag,
}: {
  netSummary: NetSummary | null;
  intlTag: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/50 bg-card p-3 shadow-sm ring-1 ring-border/30 md:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Umsatz, Kosten und Netto</h2>
        <p className="text-[11px] text-muted-foreground">
          Vergleich: gleicher Zeitraum im Vorjahr
        </p>
      </div>
      {netSummary ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Netto-Marge</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatPercent(safePercent(netSummary.currentNet, netSummary.current.revenue), intlTag)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                YoY {formatPercent(calcYoY(netSummary.currentNet, netSummary.previousNet), intlTag, true)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Retourenquote</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatPercent(
                  safePercent(netSummary.current.returnsAmount, netSummary.current.revenue),
                  intlTag
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">
                YoY{" "}
                {formatPercent(
                  calcYoY(
                    safePercent(netSummary.current.returnsAmount, netSummary.current.revenue) ?? 0,
                    safePercent(netSummary.previous.returnsAmount, netSummary.previous.revenue) ?? 0
                  ),
                  intlTag,
                  true
                )}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">AOV (Ø Bestellwert)</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatCurrency(
                  netSummary.current.orders > 0
                    ? netSummary.current.revenue / netSummary.current.orders
                    : 0,
                  netSummary.currency,
                  intlTag
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">
                YoY{" "}
                {formatPercent(
                  calcYoY(
                    netSummary.current.orders > 0
                      ? netSummary.current.revenue / netSummary.current.orders
                      : 0,
                    netSummary.previous.orders > 0
                      ? netSummary.previous.revenue / netSummary.previous.orders
                      : 0
                  ),
                  intlTag,
                  true
                )}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Netto je Bestellung</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatCurrency(
                  netSummary.current.orders > 0 ? netSummary.currentNet / netSummary.current.orders : 0,
                  netSummary.currency,
                  intlTag
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">
                YoY{" "}
                {formatPercent(
                  calcYoY(
                    netSummary.current.orders > 0 ? netSummary.currentNet / netSummary.current.orders : 0,
                    netSummary.previous.orders > 0 ? netSummary.previousNet / netSummary.previous.orders : 0
                  ),
                  intlTag,
                  true
                )}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kennzahl</TableHead>
                  <TableHead className="text-right">Aktueller Zeitraum</TableHead>
                  <TableHead className="text-right">Vorjahr</TableHead>
                  <TableHead className="text-right">YoY</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Umsatz</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.current.revenue, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.previous.revenue, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.revenue, netSummary.previous.revenue), intlTag, true)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Retouren</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.current.returnsAmount, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.previous.returnsAmount, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.returnsAmount, netSummary.previous.returnsAmount), intlTag, true)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">- returned</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.current.returnedAmount, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.previous.returnedAmount, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.returnedAmount, netSummary.previous.returnedAmount), intlTag, true)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">- cancelled</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.current.cancelledAmount, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.previous.cancelledAmount, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.cancelledAmount, netSummary.previous.cancelledAmount), intlTag, true)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Marktplatzgebuehren</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.current.feesAmount, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.previous.feesAmount, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.feesAmount, netSummary.previous.feesAmount), intlTag, true)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Anzeigenkosten</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.current.adSpendAmount, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(netSummary.previous.adSpendAmount, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.adSpendAmount, netSummary.previous.adSpendAmount), intlTag, true)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Bestellungen</TableCell>
                  <TableCell className="text-right">{formatInt(netSummary.current.orders, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatInt(netSummary.previous.orders, intlTag)}</TableCell>
                  <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.orders, netSummary.previous.orders), intlTag, true)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Ø Bestellwert (AOV)</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(
                      netSummary.current.orders > 0 ? netSummary.current.revenue / netSummary.current.orders : 0,
                      netSummary.currency,
                      intlTag
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(
                      netSummary.previous.orders > 0
                        ? netSummary.previous.revenue / netSummary.previous.orders
                        : 0,
                      netSummary.currency,
                      intlTag
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(
                      calcYoY(
                        netSummary.current.orders > 0
                          ? netSummary.current.revenue / netSummary.current.orders
                          : 0,
                        netSummary.previous.orders > 0
                          ? netSummary.previous.revenue / netSummary.previous.orders
                          : 0
                      ),
                      intlTag,
                      true
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Netto-Marge</TableCell>
                  <TableCell className="text-right">
                    {formatPercent(safePercent(netSummary.currentNet, netSummary.current.revenue), intlTag)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(safePercent(netSummary.previousNet, netSummary.previous.revenue), intlTag)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(
                      calcYoY(
                        safePercent(netSummary.currentNet, netSummary.current.revenue) ?? 0,
                        safePercent(netSummary.previousNet, netSummary.previous.revenue) ?? 0
                      ),
                      intlTag,
                      true
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Netto</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(netSummary.currentNet, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(netSummary.previousNet, netSummary.currency, intlTag)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatPercent(calcYoY(netSummary.currentNet, netSummary.previousNet), intlTag, true)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground">{netSummary.note}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Noch keine Marktplatzdaten fuer die Netto-Aufstellung verfuegbar.</p>
      )}
    </section>
  );
}
