"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/shared/components/DataTable";
import { DASHBOARD_PAGE_SHELL, DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import { DEFAULT_ARTICLE_FORECAST_RULES } from "@/shared/lib/articleForecastRules";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type XentralArticleRow = {
  sku: string;
  name: string;
  stock: number;
  price?: number | null;
};

const XENTRAL_ARTICLES_CACHE_KEY = "xentral_articles_cache_v5";

type CachedPayload = {
  savedAt: number;
  items: XentralArticleRow[];
};

type TagDef = { id: string; color: string };

const TAG_DEFS_STORAGE_KEY = "master-dashboard:xentral-product-tag-defs:v1";
const TAG_BY_SKU_STORAGE_KEY = "master-dashboard:xentral-product-tag-by-sku:v2";
const TAG_BY_SKU_STORAGE_KEY_V1 = "master-dashboard:xentral-product-tag-by-sku:v1";

const DEFAULT_TAG_DEFS: TagDef[] = [
  { id: "Abverkauf", color: "#f97316" },
  { id: "Stärker Abverkaufen", color: "#ef4444" },
  { id: "Nicht mehr verkaufen", color: "#64748b" },
];

const TAG_COLOR_PRESETS = [
  "#f97316",
  "#ef4444",
  "#64748b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#eab308",
  "#0f172a",
];

function defaultTagForStock(stock: number): string | null {
  const low = DEFAULT_ARTICLE_FORECAST_RULES.lowStockThreshold;
  const critical = DEFAULT_ARTICLE_FORECAST_RULES.criticalStockThreshold;
  if (stock <= 0) return "Nicht mehr verkaufen";
  if (critical > 0 && stock <= critical) return "Stärker Abverkaufen";
  if (stock <= low) return "Abverkauf";
  return null;
}

function ProductTagPicker({
  skuKey,
  stock,
  tagDefs,
  getTagForSku,
  setTagOverride,
  revertTagToDefault,
  addTagDef,
  removeTagDef,
  t,
}: {
  skuKey: string;
  stock: number;
  tagDefs: TagDef[];
  getTagForSku: (sku: string, stock: number) => string | null;
  setTagOverride: (sku: string, tag: string | null) => void;
  revertTagToDefault: (sku: string) => void;
  addTagDef: (name: string, color: string) => void;
  removeTagDef: (id: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_TAG_DEFS[0]!.color);
  const [colorOpen, setColorOpen] = useState(false);

  const currentTagId = getTagForSku(skuKey, stock);
  const currentDef = currentTagId ? tagDefs.find((d) => d.id === currentTagId) : undefined;
  const label =
    currentTagId === null || currentTagId === ""
      ? "—"
      : (currentTagId ?? "—");

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        nativeButton
        className="inline-flex h-7 min-w-0 max-w-[min(100%,14rem)] items-center gap-1 rounded-md border border-border/60 bg-background/70 px-1.5 text-left text-muted-foreground hover:bg-muted/60"
        aria-label={t("xentralProducts.tagPickerAria")}
        title={currentTagId ? `${currentTagId}` : t("xentralProducts.tagPickerAria")}
      >
        {currentDef ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: currentDef.color }}
            aria-hidden
          />
        ) : currentTagId ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/45"
            aria-hidden
          />
        ) : (
          <span
            className="h-2 w-2 shrink-0 rounded-full border border-dashed border-muted-foreground/35"
            aria-hidden
          />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11px] font-medium",
            currentDef ? "" : "text-muted-foreground"
          )}
          style={currentDef ? { color: currentDef.color } : undefined}
        >
          {label}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="min-w-[20rem] w-80 p-0">
        <div className="max-h-52 overflow-y-auto p-1">
          <DropdownMenuItem
            onClick={() => {
              revertTagToDefault(skuKey);
            }}
          >
            {t("xentralProducts.tagAutomatic")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setTagOverride(skuKey, null);
            }}
          >
            <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
            {t("xentralProducts.noTag")}
          </DropdownMenuItem>
          {tagDefs.map((def) => (
            <DropdownMenuItem
              key={def.id}
              className="group flex cursor-default items-center gap-0.5 pr-1"
              onClick={() => {
                setTagOverride(skuKey, def.id);
              }}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: def.color }}
                  aria-hidden
                />
                <span className="min-w-0 truncate font-medium" style={{ color: def.color }}>
                  {def.id}
                </span>
              </span>
              <button
                type="button"
                className="pointer-events-none shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100"
                aria-label={t("xentralProducts.removeTagDefAria", { label: def.id })}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeTagDef(def.id);
                }}
              >
                ×
              </button>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <div
          className="p-2"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-1.5 text-xs text-muted-foreground">{t("xentralProducts.createNewTag")}</p>
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 min-w-0 flex-1 text-sm"
              placeholder={t("xentralProducts.tagNamePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const name = newName.trim();
                  if (!name) return;
                  addTagDef(name, newColor);
                  setTagOverride(skuKey, name);
                  setNewName("");
                }
              }}
            />
            <Popover open={colorOpen} onOpenChange={setColorOpen} modal={false}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="h-8 w-8 shrink-0 rounded-full border-2 border-border shadow-sm"
                    style={{ backgroundColor: newColor }}
                    aria-label={t("xentralProducts.tagColor")}
                  />
                }
              >
                <span className="sr-only">{t("xentralProducts.tagColor")}</span>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="end" sideOffset={4}>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {TAG_COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="h-7 w-7 rounded-full border border-border/80 shadow-sm"
                      style={{ backgroundColor: c }}
                      aria-label={c}
                      onClick={() => {
                        setNewColor(c);
                        setColorOpen(false);
                      }}
                    />
                  ))}
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <span>{t("xentralProducts.colorPalette")}</span>
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="h-8 w-12 cursor-pointer overflow-hidden rounded border-0 p-0"
                  />
                </label>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 px-2"
              disabled={!newName.trim()}
              onClick={() => {
                const name = newName.trim();
                if (!name) return;
                addTagDef(name, newColor);
                setTagOverride(skuKey, name);
                setNewName("");
              }}
            >
              {t("xentralProducts.addTag")}
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function XentralProductsPage() {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<XentralArticleRow[]>([]);
  const [displayedRows, setDisplayedRows] = useState<XentralArticleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const dataRef = useRef<XentralArticleRow[]>([]);

  const [tagDefs, setTagDefs] = useState<TagDef[]>(DEFAULT_TAG_DEFS);
  const [tagBySku, setTagBySku] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const defsRaw = window.localStorage.getItem(TAG_DEFS_STORAGE_KEY);
      if (defsRaw) {
        const parsed = JSON.parse(defsRaw) as unknown;
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .map((x) => {
              if (!x || typeof x !== "object") return null;
              const o = x as Record<string, unknown>;
              const id = typeof o.id === "string" ? o.id.trim() : "";
              const color = typeof o.color === "string" ? o.color.trim() : "";
              if (!id || !color) return null;
              return { id, color } satisfies TagDef;
            })
            .filter(Boolean) as TagDef[];
          if (cleaned.length > 0) setTagDefs(cleaned);
        }
      }

      let bySkuRaw = window.localStorage.getItem(TAG_BY_SKU_STORAGE_KEY);
      if (!bySkuRaw) bySkuRaw = window.localStorage.getItem(TAG_BY_SKU_STORAGE_KEY_V1);
      if (bySkuRaw) {
        const parsed = JSON.parse(bySkuRaw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const rec = parsed as Record<string, unknown>;
          const cleaned: Record<string, string | null> = {};
          for (const [sku, value] of Object.entries(rec)) {
            if (Array.isArray(value)) {
              const first = value.find((t) => typeof t === "string") as string | undefined;
              cleaned[sku] = first?.trim() ?? null;
            } else if (typeof value === "string") {
              cleaned[sku] = value.trim() || null;
            } else if (value === null) {
              cleaned[sku] = null;
            }
          }
          setTagBySku(cleaned);
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(TAG_DEFS_STORAGE_KEY, JSON.stringify(tagDefs));
    } catch {
      /* ignore */
    }
  }, [tagDefs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(TAG_BY_SKU_STORAGE_KEY, JSON.stringify(tagBySku));
    } catch {
      /* ignore */
    }
  }, [tagBySku]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const totalStock = useMemo(
    () => displayedRows.reduce((sum, row) => sum + (row.stock ?? 0), 0),
    [displayedRows]
  );
  const totalStockLabel = useMemo(
    () => new Intl.NumberFormat(intlLocaleTag(locale)).format(totalStock),
    [totalStock, locale]
  );

  const totalInventoryValue = useMemo(() => {
    return displayedRows.reduce((sum, row) => {
      const p = row.price ?? null;
      if (p == null || !Number.isFinite(p)) return sum;
      return sum + (row.stock ?? 0) * p;
    }, 0);
  }, [displayedRows]);

  const totalInventoryValueLabel = useMemo(() => {
    return new Intl.NumberFormat(intlLocaleTag(locale), {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(totalInventoryValue);
  }, [totalInventoryValue, locale]);

  const formatEkPrice = useCallback(
    (value: number | null | undefined) => {
      if (value == null || !Number.isFinite(value)) return "—";
      return new Intl.NumberFormat(intlLocaleTag(locale), {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
      }).format(value);
    },
    [locale]
  );

  const getTagForSku = useCallback(
    (sku: string, stock: number): string | null => {
      const k = sku.trim();
      if (!k) return null;
      if (Object.prototype.hasOwnProperty.call(tagBySku, k)) {
        return tagBySku[k] ?? null;
      }
      return defaultTagForStock(stock);
    },
    [tagBySku]
  );

  const setTagOverride = useCallback((sku: string, tag: string | null) => {
    const k = sku.trim();
    if (!k) return;
    setTagBySku((prev) => ({ ...prev, [k]: tag }));
  }, []);

  const revertTagToDefault = useCallback((sku: string) => {
    const k = sku.trim();
    if (!k) return;
    setTagBySku((prev) => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
  }, []);

  const removeTagDef = useCallback((tagId: string) => {
    setTagDefs((prev) => prev.filter((d) => d.id !== tagId));
    setTagBySku((prev) => {
      const next: Record<string, string | null> = {};
      for (const [sku, tag] of Object.entries(prev)) {
        const key = sku.trim();
        if (!key) continue;
        if (tag === tagId) next[key] = null;
        else next[key] = tag;
      }
      return next;
    });
  }, []);

  const addTagDef = useCallback((name: string, color: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setTagDefs((prev) => {
      if (prev.some((d) => d.id === trimmed)) return prev;
      return [...prev, { id: trimmed, color }];
    });
  }, []);

  const load = useCallback(async (forceRefresh = false, silent = false) => {
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<CachedPayload>(XENTRAL_ARTICLES_CACHE_KEY);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        setData(parsed.items);
        setDisplayedRows(parsed.items);
        dataRef.current = parsed.items;
        hadCache = true;
        setIsLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setIsLoading(true);
    } else if (!hadCache && !silent) {
      setIsLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setIsBackgroundSyncing(true);
    }

    if (!silent) {
      setError(null);
    }

    try {
      const articlesRes = await fetch("/api/xentral/articles?all=1&limit=150", {
        cache: "no-store",
      });

      const articlesPayload = (await articlesRes.json()) as {
        items?: XentralArticleRow[];
        error?: string;
      };
      if (!articlesRes.ok) {
        throw new Error(articlesPayload.error ?? t("xentralProducts.loadError"));
      }

      const nextItems = articlesPayload.items ?? [];
      setData(nextItems);
      setDisplayedRows(nextItems);
      dataRef.current = nextItems;
      const savedAt = Date.now();
      writeLocalJsonCache(XENTRAL_ARTICLES_CACHE_KEY, { savedAt, items: nextItems } satisfies CachedPayload);
    } catch (e) {
      if (silent) {
        console.warn("[Xentral Artikel] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
      if (showBackgroundIndicator) {
        setIsBackgroundSyncing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    setHasMounted(true);
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      void load(false, true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted, load]);

  const columns = useMemo<Array<ColumnDef<XentralArticleRow>>>(
    () => [
      {
        accessorKey: "sku",
        header: t("xentralProducts.sku"),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.sku}</span>
        ),
      },
      {
        accessorKey: "name",
        header: t("xentralProducts.articleName"),
        cell: ({ row }) => {
          const raw = row.original.name ?? "";
          const truncated = raw.length > 70 ? `${raw.slice(0, 67)}…` : raw;
          return (
            <span className="text-muted-foreground" title={raw || undefined}>
              {truncated}
            </span>
          );
        },
      },
      {
        id: "tags",
        header: () => <div>{t("xentralProducts.tags")}</div>,
        cell: ({ row }) => {
          const skuKey = (row.original.sku ?? "").trim();
          const stock = row.original.stock;
          if (!skuKey) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <ProductTagPicker
              skuKey={skuKey}
              stock={stock}
              tagDefs={tagDefs}
              getTagForSku={getTagForSku}
              setTagOverride={setTagOverride}
              revertTagToDefault={revertTagToDefault}
              addTagDef={addTagDef}
              removeTagDef={removeTagDef}
              t={t}
            />
          );
        },
      },
      {
        accessorKey: "stock",
        header: () => <div className="text-right">{t("xentralProducts.stock")}</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.stock}
          </div>
        ),
      },
      {
        accessorKey: "price",
        header: () => <div className="text-right">{t("xentralProducts.purchasePrice")}</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{formatEkPrice(row.original.price)}</div>
        ),
      },
      {
        id: "inventoryValue",
        header: () => <div className="text-right">{t("xentralProducts.inventoryValue")}</div>,
        accessorFn: (row) => (row.price == null ? null : (row.stock ?? 0) * row.price),
        cell: ({ getValue }) => {
          const value = getValue<number | null>();
          if (value == null) {
            return <div className="text-right tabular-nums text-muted-foreground">—</div>;
          }
          return <div className="text-right tabular-nums">{formatEkPrice(value)}</div>;
        },
      },
    ],
    [t, formatEkPrice, tagDefs, tagBySku, getTagForSku, setTagOverride, revertTagToDefault, addTagDef, removeTagDef]
  );

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className={DASHBOARD_PAGE_TITLE}>{t("xentralProducts.title")}</h1>
          <div className="flex items-center gap-3">
            {!isLoading ? (
              <div className="flex flex-col items-end gap-1">
                <p className="text-sm text-muted-foreground">
                  {t("xentralProducts.totalStock", { count: totalStockLabel })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("xentralProducts.totalInventoryValue", { value: totalInventoryValueLabel })}
                </p>
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              disabled={isLoading || !hasMounted}
            >
              {t("xentralProducts.refresh")}
            </Button>
            {isBackgroundSyncing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("xentralProducts.syncing")}
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t("xentralProducts.subtitle")}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground backdrop-blur-sm">
          {t("xentralProducts.loading")}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          filterColumn={t("filters.skuOrArticleName")}
          paginate={false}
          compact
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
          getRowId={(row) => {
            const s = (row.sku ?? "").trim();
            return s || `__row_${row.name ?? ""}`;
          }}
          onDisplayedRowsChange={setDisplayedRows}
        />
      )}
    </div>
  );
}
