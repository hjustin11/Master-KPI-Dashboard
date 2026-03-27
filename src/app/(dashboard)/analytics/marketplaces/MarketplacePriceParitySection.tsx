"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";
import { cn } from "@/lib/utils";

type CellState = "ok" | "missing" | "no_price" | "mismatch" | "not_connected";

type ParityRow = {
  sku: string;
  name: string;
  stock: number;
  referencePrice: number | null;
  referenceSource: "xentral" | "amazon" | null;
  amazon: { price: number | null; state: CellState };
  otherMarketplaces: Record<string, { price: number | null; state: CellState }>;
  needsReview: boolean;
};

type ParityResponse = {
  error?: string;
  meta?: {
    articleCount: number;
    amazonMatchedSkus: number;
    amazonWarning: string | null;
  };
  rows?: ParityRow[];
  issueCount?: number;
};

function formatPrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function PriceCell({
  price,
  state,
  label,
}: {
  price: number | null;
  state: CellState;
  label: string;
}) {
  if (state === "not_connected") {
    return (
      <span className="text-xs text-muted-foreground" title={`${label}: Anbindung geplant`}>
        —
      </span>
    );
  }
  if (state === "missing") {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="destructive" className="w-fit text-[10px]">
          fehlt
        </Badge>
        <span className="text-[11px] text-muted-foreground">kein Listing</span>
      </div>
    );
  }
  if (state === "no_price") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="tabular-nums text-sm font-medium">—</span>
        <Badge variant="secondary" className="w-fit text-[10px]">
          Preis n. a.
        </Badge>
      </div>
    );
  }
  if (state === "mismatch") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="tabular-nums text-sm font-semibold text-rose-700">{formatPrice(price)}</span>
        <Badge variant="outline" className="w-fit border-rose-300 text-[10px] text-rose-800">
          abweichend
        </Badge>
      </div>
    );
  }
  return <span className="tabular-nums text-sm">{formatPrice(price)}</span>;
}

export function MarketplacePriceParitySection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ParityResponse | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/marketplaces/price-parity?limit=350", { cache: "no-store" });
        const json = (await res.json()) as ParityResponse;
        if (!res.ok) {
          throw new Error(json.error ?? "Preisübersicht konnte nicht geladen werden.");
        }
        setPayload(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
        setPayload(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const rows = payload?.rows ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const issueCount = payload?.issueCount ?? 0;

  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-card/80 p-4 md:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Artikel- & Preisübersicht</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Abgleich des Xentral-Artikelstamms mit Listings. <strong>Referenzpreis</strong> primär aus
            Xentral (falls im API geliefert), sonst Amazon. Abweichungen (&gt;0,5&nbsp;% bzw. 0,02&nbsp;€)
            und fehlende Amazon-Listings werden hervorgehoben. Weitere Marktplätze erscheinen, sobald
            APIs angebunden sind.
          </p>
          {payload?.meta?.amazonWarning ? (
            <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-900">
              {payload.meta.amazonWarning}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-2 md:w-64">
          <Input
            placeholder="SKU oder Artikelname filtern…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9"
          />
          {payload?.meta ? (
            <p className="text-xs text-muted-foreground">
              {payload.meta.articleCount} Artikel · {payload.meta.amazonMatchedSkus} Amazon-SKUs ·{" "}
              <span className={issueCount > 0 ? "font-medium text-amber-800" : ""}>
                {issueCount} Prüffälle
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          <div className="h-10 animate-pulse rounded-md bg-muted/60" />
          <div className="h-64 animate-pulse rounded-md bg-muted/40" />
        </div>
      ) : (
        <div className="relative max-h-[min(520px,60vh)] overflow-auto rounded-lg border border-border/50">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="sticky left-0 z-10 min-w-[140px] bg-muted/40 backdrop-blur-sm">
                  SKU
                </TableHead>
                <TableHead className="min-w-[180px]">Artikel</TableHead>
                <TableHead className="whitespace-nowrap text-right">Referenz</TableHead>
                <TableHead className="whitespace-nowrap">Amazon</TableHead>
                {ANALYTICS_MARKETPLACES.map((m) => (
                  <TableHead key={m.slug} className="whitespace-nowrap text-muted-foreground">
                    {m.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4 + ANALYTICS_MARKETPLACES.length} className="text-center text-sm text-muted-foreground">
                    Keine Artikel gefunden.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow
                    key={row.sku}
                    className={cn(row.needsReview && "bg-amber-500/[0.06]")}
                  >
                    <TableCell className="sticky left-0 z-10 bg-card font-mono text-xs backdrop-blur-sm">
                      {row.sku}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="block max-w-full cursor-default truncate text-left text-sm outline-none" tabIndex={0} />
                          }
                        >
                          {row.name}
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-sm">
                          {row.name}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="tabular-nums text-sm font-medium">
                          {formatPrice(row.referencePrice)}
                        </span>
                        {row.referenceSource ? (
                          <span className="text-[10px] text-muted-foreground">
                            {row.referenceSource === "xentral" ? "Xentral" : "Amazon"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        row.amazon.state === "mismatch" && "bg-rose-500/10",
                        row.amazon.state === "missing" && "bg-amber-500/10"
                      )}
                    >
                      <PriceCell price={row.amazon.price} state={row.amazon.state} label="Amazon" />
                    </TableCell>
                    {ANALYTICS_MARKETPLACES.map((m) => {
                      const cell = row.otherMarketplaces[m.slug] ?? {
                        price: null,
                        state: "not_connected" as const,
                      };
                      return (
                        <TableCell key={m.slug}>
                          <PriceCell price={cell.price} state={cell.state} label={m.label} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="font-normal">
          fehlt = kein Amazon-Listing zur SKU
        </Badge>
        <Badge variant="outline" className="font-normal">
          abweichend = Preis vs. Xentral-Referenz
        </Badge>
        <Badge variant="outline" className="font-normal">
          — Spalte = Kanal noch nicht angebunden
        </Badge>
      </div>
    </section>
  );
}
