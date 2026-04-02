import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { getShopifyIntegrationConfig, shopifyMissingKeysForConfig } from "@/shared/lib/shopifyApiClient";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";

type ShopifySyncItem = {
  sku: string;
  stockQty?: number;
  priceEur?: number;
};

type ShopifyVariantLite = {
  id: number;
  sku: string;
  inventory_item_id: number;
};

type FailureItem = {
  sku: string;
  reason: string;
};

const MAX_PAGES = 80;

function parseApiVersion(pathLike: string): string {
  const m = pathLike.match(/\/admin\/api\/([^/]+)\//i);
  return m?.[1] ?? "2024-10";
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normSku(value: string): string {
  return value.trim().toLowerCase();
}

function parseShopifyNextPath(linkHeader: string | null, baseUrlRaw: string): string | null {
  if (!linkHeader?.trim()) return null;
  let baseOrigin: string;
  try {
    baseOrigin = new URL(baseUrlRaw.replace(/\/+$/, "")).origin;
  } catch {
    return null;
  }
  for (const segment of linkHeader.split(",")) {
    const m = segment.trim().match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (!m?.[1]) continue;
    try {
      const u = new URL(m[1].trim());
      if (u.origin !== baseOrigin) continue;
      return `${u.pathname}${u.search}`;
    } catch {
      continue;
    }
  }
  return null;
}

async function shopifyFetch(
  config: Awaited<ReturnType<typeof getShopifyIntegrationConfig>>,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const base = config.baseUrl.replace(/\/+$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${rel}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": config.apiKey,
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(url, { cache: "no-store", ...init, headers });
}

async function resolveLocationId(
  config: Awaited<ReturnType<typeof getShopifyIntegrationConfig>>,
  apiVersion: string,
  sampleInventoryItemId: number | null
): Promise<number> {
  const fromEnv = (await getIntegrationSecretValue("SHOPIFY_LOCATION_ID")).trim();
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }

  const res = await shopifyFetch(config, `/admin/api/${apiVersion}/locations.json?limit=250`);
  const json = (await res.json().catch(() => ({}))) as {
    locations?: Array<{ id?: number; active?: boolean }>;
    errors?: unknown;
  };
  if (res.ok) {
    const locations = Array.isArray(json.locations) ? json.locations : [];
    const active = locations.find((l) => l.active && Number.isFinite(l.id));
    const any = locations.find((l) => Number.isFinite(l.id));
    const id = active?.id ?? any?.id;
    if (Number.isFinite(id)) {
      return Math.trunc(Number(id));
    }
  }

  // Fallback für fehlende read_locations-Berechtigung:
  // Location aus bestehenden Inventory-Levels einer bekannten inventory_item_id ableiten.
  if (Number.isFinite(sampleInventoryItemId) && (res.status === 403 || !res.ok)) {
    const invRes = await shopifyFetch(
      config,
      `/admin/api/${apiVersion}/inventory_levels.json?inventory_item_ids=${Math.trunc(sampleInventoryItemId!)}&limit=250`
    );
    const invJson = (await invRes.json().catch(() => ({}))) as {
      inventory_levels?: Array<{ location_id?: number }>;
      errors?: unknown;
    };
    if (invRes.ok) {
      const levels = Array.isArray(invJson.inventory_levels) ? invJson.inventory_levels : [];
      const loc = levels.find((l) => Number.isFinite(l.location_id))?.location_id;
      if (Number.isFinite(loc)) {
        return Math.trunc(Number(loc));
      }
    }
  }

  if (res.status === 403) {
    throw new Error(
      "Shopify locations HTTP 403. Bitte entweder `SHOPIFY_LOCATION_ID` setzen oder der App `read_locations` geben."
    );
  }
  if (!res.ok) {
    const msg =
      typeof json.errors === "string" ? json.errors : `Shopify locations HTTP ${res.status}`;
    throw new Error(msg);
  }
  throw new Error("Keine Shopify-Location gefunden.");
}

async function resolveVariantsBySku(
  config: Awaited<ReturnType<typeof getShopifyIntegrationConfig>>,
  apiVersion: string
): Promise<Map<string, { variantId: number; inventoryItemId: number }>> {
  const out = new Map<string, { variantId: number; inventoryItemId: number }>();
  let nextPath: string | null = `/admin/api/${apiVersion}/variants.json?limit=250&fields=id,sku,inventory_item_id`;

  for (let page = 0; page < MAX_PAGES && nextPath; page += 1) {
    const res = await shopifyFetch(config, nextPath);
    const json = (await res.json().catch(() => ({}))) as {
      variants?: ShopifyVariantLite[];
      errors?: unknown;
    };
    if (!res.ok) {
      const msg =
        typeof json.errors === "string" ? json.errors : `Shopify variants HTTP ${res.status}`;
      throw new Error(msg);
    }
    const variants = Array.isArray(json.variants) ? json.variants : [];
    for (const v of variants) {
      const sku = typeof v.sku === "string" ? normSku(v.sku) : "";
      const variantId = Number(v.id);
      const inventoryItemId = Number(v.inventory_item_id);
      if (!sku || !Number.isFinite(variantId) || !Number.isFinite(inventoryItemId)) continue;
      out.set(sku, { variantId: Math.trunc(variantId), inventoryItemId: Math.trunc(inventoryItemId) });
    }
    nextPath = parseShopifyNextPath(res.headers.get("Link"), config.baseUrl);
  }

  return out;
}

export async function PUT(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { updates?: unknown } | null;
  if (!body || !Array.isArray(body.updates)) {
    return NextResponse.json({ error: "Erwartet: { updates: [...] }." }, { status: 400 });
  }

  const dedup = new Map<string, ShopifySyncItem>();
  for (const raw of body.updates) {
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Ungültiger Update-Eintrag." }, { status: 400 });
    }
    const row = raw as Record<string, unknown>;
    const sku = String(row.sku ?? "").trim();
    const stock = toFiniteNumber(row.stockQty);
    const price = toFiniteNumber(row.priceEur);
    if (!sku || (stock == null && price == null)) {
      return NextResponse.json({ error: "Ungültiger SKU/Preis/Bestand." }, { status: 400 });
    }
    const key = normSku(sku);
    const prev = dedup.get(key) ?? { sku };
    dedup.set(key, {
      sku,
      stockQty: stock == null ? prev.stockQty : Math.max(0, Math.trunc(stock)),
      priceEur: price == null ? prev.priceEur : Number(price.toFixed(2)),
    });
  }

  const updates = [...dedup.values()];
  if (updates.length === 0) return NextResponse.json({ ok: true, updatedCount: 0, failed: [] });

  const config = await getShopifyIntegrationConfig();
  const missing = shopifyMissingKeysForConfig(config).filter((x) => x.missing);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "Shopify API ist nicht vollständig konfiguriert.",
        missingKeys: missing.map((m) => m.key),
      },
      { status: 503 }
    );
  }

  const productsPath = (await getIntegrationSecretValue("SHOPIFY_PRODUCTS_PATH")).trim();
  const apiVersion = parseApiVersion(productsPath || config.ordersPath);

  try {
    const variantsBySku = await resolveVariantsBySku(config, apiVersion);
    const needsStockWrite = updates.some((u) => u.stockQty != null);
    const sampleInventoryItemId = variantsBySku.values().next().value?.inventoryItemId ?? null;
    const locationId = needsStockWrite
      ? await resolveLocationId(config, apiVersion, sampleInventoryItemId)
      : null;

    const failed: FailureItem[] = [];
    let updatedCount = 0;

    for (const item of updates) {
      const match = variantsBySku.get(normSku(item.sku));
      if (!match) {
        failed.push({ sku: item.sku, reason: "SKU in Shopify nicht gefunden." });
        continue;
      }
      const itemFailures: string[] = [];

      if (item.priceEur != null) {
        const priceRes = await shopifyFetch(
          config,
          `/admin/api/${apiVersion}/variants/${match.variantId}.json`,
          {
            method: "PUT",
            body: JSON.stringify({
              variant: {
                id: match.variantId,
                price: item.priceEur.toFixed(2),
              },
            }),
          }
        );
        const priceJson = (await priceRes.json().catch(() => ({}))) as { errors?: unknown };
        if (!priceRes.ok) {
          const reason =
            typeof priceJson.errors === "string"
              ? priceJson.errors
              : `Shopify Preis-Update fehlgeschlagen (HTTP ${priceRes.status}).`;
          itemFailures.push(reason);
        }
      }

      if (item.stockQty != null) {
        if (!Number.isFinite(locationId)) {
          itemFailures.push("Shopify Location konnte nicht aufgeloest werden.");
        } else {
          const stockRes = await shopifyFetch(config, `/admin/api/${apiVersion}/inventory_levels/set.json`, {
            method: "POST",
            body: JSON.stringify({
              location_id: locationId,
              inventory_item_id: match.inventoryItemId,
              available: item.stockQty,
            }),
          });
          const stockJson = (await stockRes.json().catch(() => ({}))) as { errors?: unknown };
          if (!stockRes.ok) {
            const reason =
              typeof stockJson.errors === "string"
                ? stockJson.errors
                : `Shopify Bestand-Update fehlgeschlagen (HTTP ${stockRes.status}).`;
            itemFailures.push(reason);
          }
        }
      }

      if (itemFailures.length > 0) {
        failed.push({ sku: item.sku, reason: itemFailures.join(" | ") });
      } else {
        updatedCount += 1;
      }
    }

    return NextResponse.json({
      ok: failed.length === 0,
      updatedCount,
      failed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Shopify Preis/Bestand konnte nicht aktualisiert werden.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
