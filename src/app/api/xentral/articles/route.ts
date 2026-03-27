import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";

type XentralArticle = {
  sku: string;
  name: string;
  stock: number;
};

const EXCLUDED_NAME_TERMS = [
  "Versandtasche",
  "Versandkarton",
  "B-Ware",
  "Ersatzteil",
  "Volkswagen",
  // Messestand / Zubehör (Beispiele aus deinem Export)
  "Messestand",
  "Kabeltrommel",
  "Mehrfachsteckdose",
  "Beachflag",
  "Pixlip",
  "Staubsauger",
  "Cubes",
  "Schwerlastwagen",
  "Hubwagen",
  "Fernseher",
  "Tablet",
];

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

async function getSupabaseSecret(key: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integration_secrets")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return "";
  const value = (data?.value as string | undefined) ?? "";
  return value.trim();
}

async function resolveXentralConfig() {
  const baseUrl = env("XENTRAL_BASE_URL") || (await getSupabaseSecret("XENTRAL_BASE_URL"));
  const token =
    env("XENTRAL_PAT") ||
    env("XENTRAL_KEY") ||
    (await getSupabaseSecret("XENTRAL_PAT")) ||
    (await getSupabaseSecret("XENTRAL_KEY"));

  return { baseUrl, token };
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function pickFirstString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isNumericOnly(value: string) {
  return /^[0-9]+$/.test(value.trim());
}

function shouldExcludeArticle(args: { sku: string; name: string }) {
  const name = args.name.trim().toLowerCase();
  const sku = args.sku.trim();

  // Messestand-SKUs (z.B. MS-...) generell ausblenden
  if (/^MS-/i.test(sku)) return true;

  if (sku && isNumericOnly(sku)) return true;

  for (const term of EXCLUDED_NAME_TERMS) {
    if (name.includes(term.toLowerCase())) return true;
  }

  return false;
}

function mapToArticles(payload: unknown): XentralArticle[] | null {
  // Wir versuchen hier bewusst tolerant zu mappen, weil Xentral je nach Setup andere Feldnamen liefert.
  const root = payload as Record<string, unknown> | null;
  const candidates: unknown[] =
    Array.isArray(payload) ? payload : Array.isArray(root?.data) ? (root?.data as unknown[]) : [];
  if (!Array.isArray(candidates) || !candidates.length) return [];

  const rows: XentralArticle[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;

    const sku =
      pickFirstString(obj.sku) ??
      pickFirstString(obj.SKU) ??
      pickFirstString(obj.number) ??
      pickFirstString(obj.nummer) ??
      pickFirstString(obj.articleNumber) ??
      pickFirstString(obj.artikelnummer) ??
      "";

    const name =
      pickFirstString(obj.name) ??
      pickFirstString(obj.bezeichnung) ??
      pickFirstString(obj.titel) ??
      pickFirstString(obj.artikelname) ??
      "";

    const stock =
      asNumber(obj.stock) ??
      asNumber(obj.bestand) ??
      asNumber(obj.lagerbestand) ??
      asNumber(obj.availableCount) ??
      asNumber((obj.stockStats as Record<string, unknown> | undefined)?.availableCount) ??
      asNumber((obj.stockStats as Record<string, unknown> | undefined)?.totalCount) ??
      asNumber(obj.stockCount) ??
      asNumber(obj.on_hand) ??
      0;

    if (!sku && !name) continue;
    if (shouldExcludeArticle({ sku, name })) continue;
    rows.push({ sku, name, stock });
  }

  return rows;
}

function parseTotalCount(payload: unknown): number | null {
  const root = payload as Record<string, unknown> | null;
  const extra = (root?.extra as Record<string, unknown> | undefined) ?? undefined;
  const totalCount = extra?.totalCount;
  return asNumber(totalCount);
}

export async function GET(request: Request) {
  const { baseUrl, token } = await resolveXentralConfig();

  if (!baseUrl || !token) {
    return NextResponse.json(
      {
        error:
          "Xentral ist nicht konfiguriert. Bitte Env Vars setzen oder Supabase Tabelle 'integration_secrets' befüllen.",
        missing: {
          XENTRAL_BASE_URL: !baseUrl,
          XENTRAL_PAT_or_KEY: !token,
        },
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const fetchAll = searchParams.get("all") === "1";
  const rawLimit = Number(searchParams.get("limit") ?? "150") || 150;
  const pageSize = Math.min(Math.max(rawLimit, 10), 150);
  const pageNumber = Math.max(Number(searchParams.get("page") ?? "1") || 1, 1);

  async function fetchPage(page: number) {
    const url = new URL(joinUrl(baseUrl, "api/v1/products"));
    url.searchParams.set("page[number]", String(page));
    url.searchParams.set("page[size]", String(pageSize));
    if (query) {
      url.searchParams.set("filter[0][key]", "search");
      url.searchParams.set("filter[0][value]", query);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      json = null;
    }

    return { res, text, json, url: url.toString() };
  }

  const first = await fetchPage(pageNumber);
  if (!first.res.ok || !first.json) {
    return NextResponse.json(
      {
        error:
          first.res.status === 401
            ? "Xentral API: Unauthorized (401). Bitte Personal Access Token (PAT) in .env.local setzen."
            : "Xentral API konnte nicht gelesen werden. Token/Endpoint prüfen.",
        status: first.res.status,
        debug:
          process.env.NODE_ENV !== "production"
            ? {
                baseUrl,
                hasToken: Boolean(token),
                tokenLength: token.length,
                tokenHasPipe: token.includes("|"),
                pageNumber,
                pageSize,
                url: first.url,
              }
            : undefined,
        preview: (first.text ?? "").slice(0, 240),
      },
      { status: 502 }
    );
  }

  const firstItems = mapToArticles(first.json) ?? [];
  const totalCount = parseTotalCount(first.json) ?? firstItems.length;

  if (!fetchAll) {
    return NextResponse.json({ items: firstItems, totalCount });
  }

  const items: XentralArticle[] = [...firstItems];
  const maxItems = 20_000;
  const maxPages = 400;
  let page = pageNumber + 1;
  while (items.length < totalCount && items.length < maxItems && page <= maxPages) {
    const next = await fetchPage(page);
    if (!next.res.ok || !next.json) break;
    const nextItems = mapToArticles(next.json) ?? [];
    if (!nextItems.length) break;
    items.push(...nextItems);
    page += 1;
  }

  return NextResponse.json({ items, totalCount });
}

