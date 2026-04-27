import { NextResponse } from "next/server";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";

export const maxDuration = 300;

/**
 * Volles Export-Endpoint: fetcht für jede übergebene Produkt-ID alle relevanten
 * Xentral-Sub-Resources inkl. Files/Bilder, flacht das Ergebnis auf `{key: value}`
 * ab (dot-notation) und liefert `{columns, rows}`.
 *
 * Body: `{ ids: string[] }` — Xentral-Produkt-IDs (JSON:API `data[].id`).
 * Response: `{ columns: string[]; rows: Record<string, string | number>[] }`.
 */

const SUB_RESOURCES: { suffix: string; prefix: string }[] = [
  { suffix: "", prefix: "main" },
  { suffix: "/stocksettings", prefix: "stocksettings" },
  { suffix: "/manufacturerinformation", prefix: "manufacturerinformation" },
  { suffix: "/productinformation", prefix: "productinformation" },
  { suffix: "/productdimensions", prefix: "productdimensions" },
  { suffix: "/dimensions", prefix: "dimensions" },
  { suffix: "/purchaseinformation", prefix: "purchaseinformation" },
  { suffix: "/salesinformation", prefix: "salesinformation" },
  { suffix: "/specificcharacteristic", prefix: "specificcharacteristic" },
  { suffix: "/productcharacteristic", prefix: "productcharacteristic" },
  { suffix: "/files", prefix: "files" },
  { suffix: "/images", prefix: "images" },
];

const MAX_ARRAY_ITEMS = 20;
const MAX_PRODUCTS = 500;
const CONCURRENCY = 5;

function isPrim(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function flattenInto(
  value: unknown,
  key: string,
  out: Record<string, string | number>
): void {
  if (value == null) return;
  if (isPrim(value)) {
    if (typeof value === "boolean") out[key] = value ? "true" : "false";
    else out[key] = value;
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    const allPrim = value.every((v) => v == null || isPrim(v));
    if (allPrim) {
      const joined = value
        .filter((v) => v != null)
        .map((v) => (typeof v === "boolean" ? (v ? "true" : "false") : String(v)))
        .join("; ");
      if (joined) out[key] = joined;
      return;
    }
    const cap = Math.min(value.length, MAX_ARRAY_ITEMS);
    for (let i = 0; i < cap; i++) {
      flattenInto(value[i], `${key}[${i}]`, out);
    }
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenInto(v, key ? `${key}.${k}` : k, out);
    }
  }
}

async function fetchSubResource(
  base: string,
  token: string,
  productId: string,
  suffix: string
): Promise<unknown> {
  const url = `${base}/api/v1/products/${encodeURIComponent(productId)}${suffix}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      const json = JSON.parse(text) as unknown;
      if (json && typeof json === "object") {
        const root = json as Record<string, unknown>;
        return root.data ?? root;
      }
      return json;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function fetchProductFlat(
  base: string,
  token: string,
  productId: string
): Promise<Record<string, string | number>> {
  const results = await Promise.all(
    SUB_RESOURCES.map(async ({ suffix, prefix }) => {
      const data = await fetchSubResource(base, token, productId, suffix);
      return { prefix, data };
    })
  );

  const flat: Record<string, string | number> = {};
  flat.xentral_product_id = productId;
  for (const { prefix, data } of results) {
    if (data == null) continue;
    flattenInto(data, prefix, flat);
  }
  return flat;
}

async function runInBatches<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await worker(items[idx]!, idx);
    }
  });
  await Promise.all(runners);
  return out;
}

async function resolveConfig(): Promise<{ baseUrl: string | null; token: string | null }> {
  const baseUrl = await getIntegrationSecretValue("XENTRAL_BASE_URL");
  const token =
    (await getIntegrationSecretValue("XENTRAL_PAT")) ||
    (await getIntegrationSecretValue("XENTRAL_KEY"));
  return { baseUrl: baseUrl ?? null, token: token ?? null };
}

export async function POST(request: Request) {
  const { baseUrl, token } = await resolveConfig();
  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "Xentral ist nicht konfiguriert." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = body as { ids?: unknown };
  const rawIds = Array.isArray(parsed.ids) ? parsed.ids : [];
  const ids = rawIds
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((s): s is string => s.length > 0);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Keine Produkt-IDs übergeben." },
      { status: 400 }
    );
  }
  if (ids.length > MAX_PRODUCTS) {
    return NextResponse.json(
      { error: `Zu viele Produkte (max ${MAX_PRODUCTS}).` },
      { status: 400 }
    );
  }

  const base = baseUrl.replace(/\/+$/, "");
  const flats = await runInBatches(ids, CONCURRENCY, (id) =>
    fetchProductFlat(base, token, id)
  );

  const columnSet = new Set<string>();
  for (const row of flats) for (const k of Object.keys(row)) columnSet.add(k);

  const preferred = [
    "xentral_product_id",
    "main.attributes.number",
    "main.attributes.name",
    "main.attributes.description",
    "main.attributes.ean",
    "main.attributes.manufacturer",
    "manufacturerinformation.attributes.ean",
    "manufacturerinformation.attributes.brand",
    "salesinformation.attributes.price",
    "stocksettings.attributes.weight",
    "stocksettings.attributes.length",
    "stocksettings.attributes.width",
    "stocksettings.attributes.height",
  ];
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const c of preferred) {
    if (columnSet.has(c) && !seen.has(c)) {
      columns.push(c);
      seen.add(c);
    }
  }
  for (const c of [...columnSet].sort()) {
    if (!seen.has(c)) {
      columns.push(c);
      seen.add(c);
    }
  }

  return NextResponse.json({ columns, rows: flats });
}
