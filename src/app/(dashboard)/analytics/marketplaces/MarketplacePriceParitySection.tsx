"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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
import {
  DASHBOARD_COMPACT_CARD,
  DASHBOARD_COMPACT_TABLE_SCROLL,
  DASHBOARD_COMPACT_TABLE_TEXT,
  DASHBOARD_META_TEXT,
  DASHBOARD_SECTION_TITLE,
} from "@/shared/lib/dashboardUi";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";

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
    ottoWarning?: string | null;
  };
  rows?: ParityRow[];
  issueCount?: number;
};

const PRICE_PARITY_CACHE_KEY = "marketplace_price_parity_v1";

type CachedParityPayload = { savedAt: number } & ParityResponse;

/**
 * Gleiche Fläche auf **allen** Zellen der Zeile — nicht nur SKU/Amazon,
 * sonst wirken mittlere Spalten heller (nur Zeilen-Ton `/[0.06]`).
 */
function amazonParityRowBg(state: CellState) {
  if (state === "mismatch") return "bg-rose-500/10";
  if (state === "missing" || state === "no_price") return "bg-amber-500/10";
  return "";
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
  const { t, locale } = useTranslation();
  const intlTag = intlLocaleTag(locale);
  const formatPrice = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat(intlTag, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  if (state === "not_connected") {
    return (
      <span
        className="text-xs text-muted-foreground"
        title={`${label}: ${t("priceParity.notConnected")}`}
      >
        —
      </span>
    );
  }
  if (state === "missing") {
    return (
      <div className="flex flex-col gap-px">
        <Badge variant="destructive" className="h-5 w-fit px-1.5 py-0 text-[10px] leading-none">
          {t("priceParity.missingListing")}
        </Badge>
        <span className="text-[10px] leading-tight text-muted-foreground">{t("priceParity.noListing")}</span>
      </div>
    );
  }
  if (state === "no_price") {
    return (
      <div className="flex flex-col gap-px">
        <span className="tabular-nums text-xs font-medium leading-tight">—</span>
        <Badge variant="secondary" className="h-5 w-fit px-1.5 py-0 text-[10px] leading-none">
          {t("priceParity.priceNa")}
        </Badge>
      </div>
    );
  }
  if (state === "mismatch") {
    return (
      <div className="flex flex-col gap-px">
        <span className="tabular-nums text-xs font-semibold leading-tight text-rose-700">
          {formatPrice(price)}
        </span>
        <Badge
          variant="outline"
          className="h-5 w-fit border-rose-300 px-1.5 py-0 text-[10px] leading-none text-rose-800"
        >
          {t("priceParity.deviating")}
        </Badge>
      </div>
    );
  }
  return <span className="tabular-nums text-xs leading-tight">{formatPrice(price)}</span>;
}

export function MarketplacePriceParitySection() {
  const { t, locale } = useTranslation();
  const intlTag = intlLocaleTag(locale);
  const formatRefPrice = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat(intlTag, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };
  const formatStock = (value: number) => {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat(intlTag, { maximumFractionDigits: 0 }).format(value);
  };
  const [loading, setLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ParityResponse | null>(null);
  const [query, setQuery] = useState("");
  const [hasMounted, setHasMounted] = useState(false);
  const payloadRef = useRef<ParityResponse | null>(null);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const load = useCallback(async (forceRefresh = false, silent = false) => {
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<CachedParityPayload>(PRICE_PARITY_CACHE_KEY);
      if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0 && !parsed.error) {
        const { savedAt: _s, ...rest } = parsed;
        setPayload(rest);
        hadCache = true;
        setLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setLoading(true);
    } else if (!hadCache && !silent) {
      setLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setIsBackgroundSyncing(true);
    }

    if (!silent) {
      setError(null);
    }

    try {
      const res = await fetch("/api/marketplaces/price-parity?limit=350", { cache: "no-store" });
      const json = (await res.json()) as ParityResponse;
      if (!res.ok) {
        throw new Error(json.error ?? t("priceParity.loadError"));
      }
      setPayload(json);
      writeLocalJsonCache(PRICE_PARITY_CACHE_KEY, {
        savedAt: Date.now(),
        ...json,
      } satisfies CachedParityPayload);
    } catch (e) {
      if (silent) {
        console.warn("[Preisparität] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setError(e instanceof Error ? e.message : t("commonUi.unknownError"));
        if (!payloadRef.current) {
          setPayload(null);
        }
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
      if (showBackgroundIndicator) {
        setIsBackgroundSyncing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    setHasMounted(true);
    void load(false, false);
  }, [load]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      void load(false, true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted, load]);

  const rows = payload?.rows ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const raw = r.name.toLowerCase();
      return r.sku.toLowerCase().includes(q) || raw.includes(q);
    });
  }, [rows, query]);

  const issueCount = payload?.issueCount ?? 0;

  return (
    <section className={cn(DASHBOARD_COMPACT_CARD, "gap-2")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className={DASHBOARD_SECTION_TITLE}>{t("priceParity.title")}</h2>
          {payload?.meta?.amazonWarning ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-900">
              {payload.meta.amazonWarning}
            </p>
          ) : null}
          {payload?.meta?.ottoWarning ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-900">
              {payload.meta.ottoWarning}
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-56 sm:shrink-0">
          <Input
            placeholder={t("priceParity.filterPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-xs"
          />
          {isBackgroundSyncing ? (
            <span className={cn("inline-flex items-center gap-1.5", DASHBOARD_META_TEXT)}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("priceParity.syncing")}
            </span>
          ) : null}
          {payload?.meta ? (
            <p className={cn(DASHBOARD_META_TEXT, "leading-tight")}>
              {t("priceParity.metaLine", {
                articles: String(payload.meta.articleCount),
                amazonSkus: String(payload.meta.amazonMatchedSkus),
                issues: String(issueCount),
              })}
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-xs leading-snug text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-1.5">
          <div className="h-7 animate-pulse rounded-md bg-muted/60" />
          <div className="h-56 animate-pulse rounded-md bg-muted/40" />
        </div>
      ) : (
        <div
          className={cn(
            DASHBOARD_COMPACT_TABLE_SCROLL,
            "relative min-h-[280px] max-h-[min(480px,58vh)] flex-1 rounded-md"
          )}
        >
          <Table className={DASHBOARD_COMPACT_TABLE_TEXT}>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="sticky left-0 z-10 min-w-[18ch] w-[18ch] max-w-[18ch] bg-muted/40 px-2 backdrop-blur-sm">
                  {t("priceParity.sku")}
                </TableHead>
                <TableHead className="w-[3.25rem] min-w-[3rem] max-w-[3.5rem] whitespace-nowrap text-right">
                  {t("priceParity.stock")}
                </TableHead>
                <TableHead className="min-w-[9rem]">{t("priceParity.article")}</TableHead>
                <TableHead className="whitespace-nowrap text-right">{t("priceParity.reference")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("priceParity.amazon")}</TableHead>
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
                  <TableCell
                    colSpan={5 + ANALYTICS_MARKETPLACES.length}
                    className="text-center text-xs text-muted-foreground"
                  >
                    {t("priceParity.noArticles")}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.sku}>
                    <TableCell
                      className={cn(
                        "sticky left-0 z-10 min-w-[18ch] w-[18ch] max-w-[18ch] px-2 font-mono text-xs",
                        amazonParityRowBg(row.amazon.state) || "bg-card"
                      )}
                      title={row.sku}
                    >
                      <span className="block truncate">{row.sku}</span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "w-[3.25rem] min-w-[3rem] max-w-[3.5rem] text-right tabular-nums text-xs",
                        amazonParityRowBg(row.amazon.state)
                      )}
                    >
                      {formatStock(row.stock)}
                    </TableCell>
                    <TableCell className={cn("max-w-[11rem]", amazonParityRowBg(row.amazon.state))}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="block max-w-full cursor-default truncate text-left text-xs leading-tight outline-none" tabIndex={0} />
                          }
                        >
                          {row.name}
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-sm">
                          {row.name}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className={cn("text-right", amazonParityRowBg(row.amazon.state))}>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="tabular-nums text-xs font-medium leading-tight">
                          {formatRefPrice(row.referencePrice)}
                        </span>
                        {row.referenceSource ? (
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            {row.referenceSource === "xentral" ? "Xentral" : "Amazon"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={amazonParityRowBg(row.amazon.state)}>
                      <PriceCell
                        price={row.amazon.price}
                        state={row.amazon.state}
                        label={t("priceParity.amazon")}
                      />
                    </TableCell>
                    {ANALYTICS_MARKETPLACES.map((m) => {
                      const cell = row.otherMarketplaces[m.slug] ?? {
                        price: null,
                        state: "not_connected" as const,
                      };
                      return (
                        <TableCell key={m.slug} className={amazonParityRowBg(row.amazon.state)}>
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
    </section>
  );
}
