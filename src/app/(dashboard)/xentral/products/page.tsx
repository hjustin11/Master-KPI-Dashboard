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
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import {
  readXentralTagMirror,
  writeXentralTagMirror,
} from "@/shared/lib/xentralProductTagMirror";
import { cn } from "@/lib/utils";
import { compareLocaleStringEmptyLast } from "@/shared/lib/tableSort";
import { mergeXentralArticleLists } from "@/shared/lib/xentralArticleMerge";
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
  salesPrice?: number | null;
};

type XentralArticleTableRow = XentralArticleRow & {
  /** Dedizierter Sortierschlüssel für Tag-Spalte (stabil für TanStack). */
  __tagSort: string;
};

const XENTRAL_ARTICLES_CACHE_KEY = "xentral_articles_cache_v5";

type CachedPayload = {
  savedAt: number;
  items: XentralArticleRow[];
};

type TagDef = { id: string; color: string };

/** Legacy localStorage — einmalige Übernahme in Supabase (globaler Sync). */
const TAG_DEFS_STORAGE_KEY = "master-dashboard:xentral-product-tag-defs:v1";
const TAG_BY_SKU_STORAGE_KEY = "master-dashboard:xentral-product-tag-by-sku:v2";
const TAG_BY_SKU_STORAGE_KEY_V1 = "master-dashboard:xentral-product-tag-by-sku:v1";
const TAG_SYNC_MIGRATION_KEY = "master-dashboard:xentral-tags-sync-migrated:v1";

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

function mergeTagDefs(server: TagDef[], local: TagDef[]): TagDef[] {
  const map = new Map<string, TagDef>();
  for (const d of server) map.set(d.id, d);
  for (const d of local) {
    if (!map.has(d.id)) map.set(d.id, d);
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function readLegacyLocalTags(): { defs: TagDef[]; bySku: Record<string, string | null> } | null {
  if (typeof window === "undefined") return null;
  try {
    let defs: TagDef[] = [];
    const defsRaw = window.localStorage.getItem(TAG_DEFS_STORAGE_KEY);
    if (defsRaw) {
      const parsed = JSON.parse(defsRaw) as unknown;
      if (Array.isArray(parsed)) {
        defs = parsed
          .map((x) => {
            if (!x || typeof x !== "object") return null;
            const o = x as Record<string, unknown>;
            const id = typeof o.id === "string" ? o.id.trim() : "";
            const color = typeof o.color === "string" ? o.color.trim() : "";
            if (!id || !color) return null;
            return { id, color } satisfies TagDef;
          })
          .filter(Boolean) as TagDef[];
      }
    }

    const bySku: Record<string, string | null> = {};
    let bySkuRaw = window.localStorage.getItem(TAG_BY_SKU_STORAGE_KEY);
    if (!bySkuRaw) bySkuRaw = window.localStorage.getItem(TAG_BY_SKU_STORAGE_KEY_V1);
    if (bySkuRaw) {
      const parsed = JSON.parse(bySkuRaw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const rec = parsed as Record<string, unknown>;
        for (const [sku, value] of Object.entries(rec)) {
          if (Array.isArray(value)) {
            const first = value.find((t) => typeof t === "string") as string | undefined;
            bySku[sku] = first?.trim() ?? null;
          } else if (typeof value === "string") {
            bySku[sku] = value.trim() || null;
          } else if (value === null) {
            bySku[sku] = null;
          }
        }
      }
    }

    if (defs.length === 0 && Object.keys(bySku).length === 0) return null;
    return { defs, bySku };
  } catch {
    return null;
  }
}

function clearLegacyLocalTagKeys() {
  try {
    window.localStorage.removeItem(TAG_DEFS_STORAGE_KEY);
    window.localStorage.removeItem(TAG_BY_SKU_STORAGE_KEY);
    window.localStorage.removeItem(TAG_BY_SKU_STORAGE_KEY_V1);
  } catch {
    /* ignore */
  }
}

function ProductTagPicker({
  skuKey,
  tagDefs,
  getTagForSku,
  setTagOverride,
  addTagDef,
  removeTagDef,
  t,
}: {
  skuKey: string;
  tagDefs: TagDef[];
  getTagForSku: (sku: string) => string | null;
  setTagOverride: (sku: string, tag: string | null) => void;
  addTagDef: (name: string, color: string) => void;
  removeTagDef: (id: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_TAG_DEFS[0]!.color);
  const [colorOpen, setColorOpen] = useState(false);

  const currentTagId = getTagForSku(skuKey);
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

  /** Laufende SKU-PATCHes — verhindert, dass `loadTags` den optimistischen Stand überschreibt. */
  const pendingSkuTagWritesRef = useRef(new Set<string>());
  const pendingTagDefsWriteRef = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /** Beim Start: letzten lokalen Spiegel laden (sofort sichtbar, bevor Supabase antwortet). */
  useEffect(() => {
    const m = readXentralTagMirror();
    if (!m) return;
    setTagDefs(m.tagDefs.length > 0 ? m.tagDefs : DEFAULT_TAG_DEFS);
    setTagBySku(m.tagBySku);
  }, []);

  /** Nach jeder Änderung: Spiegel in localStorage (lokal zuerst; parallel globales Sync über API). */
  const skipInitialMirrorWriteRef = useRef(true);
  useEffect(() => {
    if (skipInitialMirrorWriteRef.current) {
      skipInitialMirrorWriteRef.current = false;
      return;
    }
    writeXentralTagMirror(tagBySku, tagDefs);
  }, [tagBySku, tagDefs]);

  const loadTags = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/xentral/product-tags", {
        cache: "no-store",
        credentials: "include",
      });
      if (res.status === 401 || res.status === 503) {
        const offline = readXentralTagMirror();
        if (offline) {
          setTagDefs(offline.tagDefs.length > 0 ? offline.tagDefs : DEFAULT_TAG_DEFS);
          setTagBySku(offline.tagBySku);
        }
        return false;
      }
      if (!res.ok) {
        return false;
      }
      const dataJson = (await res.json()) as {
        tagDefs?: TagDef[];
        tagBySku?: Record<string, string | null>;
      };
      let nextDefs = dataJson.tagDefs ?? [];
      let nextBySku = dataJson.tagBySku ?? {};

      if (typeof window !== "undefined" && !window.localStorage.getItem(TAG_SYNC_MIGRATION_KEY)) {
        const legacy = readLegacyLocalTags();
        const serverSkuEmpty = Object.keys(nextBySku).length === 0;
        if (!legacy || !serverSkuEmpty) {
          window.localStorage.setItem(TAG_SYNC_MIGRATION_KEY, "1");
        } else {
          const mergedDefs = mergeTagDefs(nextDefs, legacy.defs);
          const putDefs = await fetch("/api/xentral/product-tags/definitions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ defs: mergedDefs.length > 0 ? mergedDefs : DEFAULT_TAG_DEFS }),
          });
          if (putDefs.ok) {
            for (const [sku, tag] of Object.entries(legacy.bySku)) {
              const k = sku.trim();
              if (!k) continue;
              const r = await fetch("/api/xentral/product-tags/sku", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ sku: k, tag }),
              });
              if (!r.ok) break;
            }
            clearLegacyLocalTagKeys();
            window.localStorage.setItem(TAG_SYNC_MIGRATION_KEY, "1");
            const again = await fetch("/api/xentral/product-tags", {
              cache: "no-store",
              credentials: "include",
            });
            if (again.ok) {
              const j2 = (await again.json()) as {
                tagDefs?: TagDef[];
                tagBySku?: Record<string, string | null>;
              };
              nextDefs = j2.tagDefs ?? [];
              nextBySku = j2.tagBySku ?? {};
            }
          }
        }
      }

      setTagDefs((prev) => {
        if (pendingTagDefsWriteRef.current > 0) return prev;
        return nextDefs.length > 0 ? nextDefs : DEFAULT_TAG_DEFS;
      });
      setTagBySku((prev) => {
        if (pendingSkuTagWritesRef.current.size === 0) {
          return nextBySku;
        }
        const out: Record<string, string | null> = { ...nextBySku };
        for (const sku of pendingSkuTagWritesRef.current) {
          if (Object.prototype.hasOwnProperty.call(prev, sku)) {
            out[sku] = prev[sku] ?? null;
          } else {
            delete out[sku];
          }
        }
        return out;
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const persistTagDefs = useCallback(
    async (defs: TagDef[]) => {
      pendingTagDefsWriteRef.current += 1;
      try {
        const res = await fetch("/api/xentral/product-tags/definitions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ defs }),
        });
        if (!res.ok) {
          void loadTags();
        }
      } finally {
        pendingTagDefsWriteRef.current -= 1;
      }
    },
    [loadTags]
  );

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

  const totalSalesValue = useMemo(() => {
    return displayedRows.reduce((sum, row) => {
      const p = row.salesPrice ?? null;
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

  const totalSalesValueLabel = useMemo(() => {
    return new Intl.NumberFormat(intlLocaleTag(locale), {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(totalSalesValue);
  }, [totalSalesValue, locale]);

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

  const getTagForSku = useCallback((sku: string): string | null => {
    const k = sku.trim();
    if (!k) return null;
    if (Object.prototype.hasOwnProperty.call(tagBySku, k)) {
      return tagBySku[k] ?? null;
    }
    return null;
  }, [tagBySku]);

  const setTagOverride = useCallback(
    async (sku: string, tag: string | null) => {
      const k = sku.trim();
      if (!k) return;
      pendingSkuTagWritesRef.current.add(k);
      try {
        setTagBySku((prev) => ({ ...prev, [k]: tag }));
        const res = await fetch("/api/xentral/product-tags/sku", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sku: k, tag }),
        });
        if (!res.ok) {
          void loadTags();
        }
      } finally {
        pendingSkuTagWritesRef.current.delete(k);
      }
    },
    [loadTags]
  );

  const removeTagDef = useCallback(
    (tagId: string) => {
      setTagDefs((prev) => {
        const next = prev.filter((d) => d.id !== tagId);
        void persistTagDefs(next);
        return next;
      });
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
    },
    [persistTagDefs]
  );

  const addTagDef = useCallback(
    (name: string, color: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setTagDefs((prev) => {
        if (prev.some((d) => d.id === trimmed)) return prev;
        const next = [...prev, { id: trimmed, color }];
        void persistTagDefs(next);
        return next;
      });
    },
    [persistTagDefs]
  );

  const load = useCallback(async (options?: { bustServerCache?: boolean; silent?: boolean }) => {
    const bustServerCache = options?.bustServerCache ?? false;
    const silent = options?.silent ?? false;
    let hadCache = false;

    if (!bustServerCache && !silent) {
      const parsed = readLocalJsonCache<CachedPayload>(XENTRAL_ARTICLES_CACHE_KEY);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        setData(parsed.items);
        setDisplayedRows(parsed.items);
        dataRef.current = parsed.items;
        hadCache = true;
        setIsLoading(false);
      }
    }

    const retainVisual = hadCache || dataRef.current.length > 0;
    if (!silent && !retainVisual && !hadCache) {
      setIsLoading(true);
    }
    if (silent || retainVisual) {
      setIsBackgroundSyncing(true);
    }

    if (!silent) {
      setError(null);
    }

    try {
      const qs = new URLSearchParams({ all: "1", limit: "150" });
      if (bustServerCache) {
        qs.set("refresh", "1");
      }
      const articlesRes = await fetch(`/api/xentral/articles?${qs.toString()}`, {
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
      const merged = mergeXentralArticleLists(dataRef.current, nextItems);
      setData(merged);
      setDisplayedRows(merged);
      dataRef.current = merged;
      const savedAt = Date.now();
      writeLocalJsonCache(XENTRAL_ARTICLES_CACHE_KEY, { savedAt, items: merged } satisfies CachedPayload);
    } catch (e) {
      if (silent) {
        console.warn("[Xentral Artikel] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      void loadTags();
      if (!silent) {
        setIsLoading(false);
      }
      if (silent || retainVisual) {
        setIsBackgroundSyncing(false);
      }
    }
  }, [t, loadTags]);

  useEffect(() => {
    setHasMounted(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void load({ silent: true });
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted, load]);

  const tableData = useMemo<XentralArticleTableRow[]>(
    () =>
      data.map((row) => {
        const sku = (row.sku ?? "").trim();
        const rawTag = sku ? getTagForSku(sku) ?? "" : "";
        return {
          ...row,
          __tagSort: rawTag.trim().toLocaleLowerCase(),
        };
      }),
    [data, getTagForSku]
  );

  const columns = useMemo<Array<ColumnDef<XentralArticleTableRow>>>(
    () => [
      {
        accessorKey: "sku",
        header: t("xentralProducts.sku"),
        meta: { align: "left" as const },
        cell: ({ row }) => (
          <span className="font-medium">{row.original.sku}</span>
        ),
      },
      {
        accessorKey: "name",
        header: t("xentralProducts.articleName"),
        meta: { align: "left" as const },
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
        header: t("xentralProducts.tags"),
        meta: { align: "left" as const },
        accessorKey: "__tagSort",
        enableSorting: true,
        sortingFn: (rowA, rowB, columnId) =>
          compareLocaleStringEmptyLast(
            String(rowA.getValue(columnId) ?? ""),
            String(rowB.getValue(columnId) ?? "")
          ),
        cell: ({ row }) => {
          const skuKey = (row.original.sku ?? "").trim();
          if (!skuKey) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <ProductTagPicker
              skuKey={skuKey}
              tagDefs={tagDefs}
              getTagForSku={getTagForSku}
              setTagOverride={setTagOverride}
              addTagDef={addTagDef}
              removeTagDef={removeTagDef}
              t={t}
            />
          );
        },
      },
      {
        accessorKey: "stock",
        header: t("xentralProducts.stock"),
        meta: { align: "right" as const },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.stock}</span>
        ),
      },
      {
        accessorKey: "price",
        header: t("xentralProducts.purchasePrice"),
        meta: { align: "right" as const },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatEkPrice(row.original.price)}</span>
        ),
      },
      {
        id: "inventoryValue",
        header: t("xentralProducts.inventoryValue"),
        meta: { align: "right" as const },
        accessorFn: (row) => (row.price == null ? null : (row.stock ?? 0) * row.price),
        cell: ({ getValue }) => {
          const value = getValue<number | null>();
          if (value == null) {
            return <span className="tabular-nums text-muted-foreground">—</span>;
          }
          return <span className="tabular-nums">{formatEkPrice(value)}</span>;
        },
      },
    ],
    [t, formatEkPrice, tagDefs, getTagForSku, setTagOverride, addTagDef, removeTagDef]
  );

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className={DASHBOARD_PAGE_TITLE}>{t("xentralProducts.title")}</h1>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load({ bustServerCache: true })}
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
          data={tableData}
          filterColumn={t("filters.skuOrArticleName")}
          paginate={false}
          compact
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0 [&_[data-slot=table-head]]:!px-3 [&_[data-slot=table-cell]]:!px-3"
          toolbarEnd={
            <div className="flex flex-wrap items-end justify-end gap-3 sm:gap-4">
              <div className="min-w-0 text-right">
                <p className="text-[10px] font-normal tracking-wide text-muted-foreground/85">
                  {t("xentralProducts.totalStockKpiLabel")}
                </p>
                <p className="text-sm font-medium tabular-nums tracking-tight text-muted-foreground">
                  {totalStockLabel}
                </p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-[10px] font-normal tracking-wide text-muted-foreground/85">
                  {t("xentralProducts.totalInventoryValueKpiLabel")}
                </p>
                <p className="text-sm font-medium tabular-nums tracking-tight text-muted-foreground">
                  {totalInventoryValueLabel}
                </p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-[10px] font-normal tracking-wide text-muted-foreground/85">
                  Verkaufswert: Gesamt
                </p>
                <p className="text-sm font-medium tabular-nums tracking-tight text-muted-foreground">
                  {totalSalesValueLabel}
                </p>
              </div>
            </div>
          }
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
