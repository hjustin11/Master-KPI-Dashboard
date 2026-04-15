import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { parseSearchParams } from "@/shared/lib/apiValidation";
import { apiOk, apiUnauthenticated } from "@/shared/lib/apiResponse";

/**
 * Aggregator-Route für Analytics → Marktplätze.
 *
 * **Zweck:** Statt dass der Browser 9 parallele Sales-Calls abfeuert (und den Supabase-Pool von 10
 * Connections überlastet — siehe Incident 2026-04-15), ruft der Client **einen** Endpoint auf und
 * bekommt ein konsolidiertes Aggregat zurück. Serverseitig gilt Concurrency = 3.
 *
 * **Strategie:** Wir proxen auf die bestehenden Marktplatz-Sales-Routen. Das vermeidet Duplikation
 * der per-Marktplatz-Logik (SigV4, OAuth-Refresh, Mirakl-Paginierung) und nutzt deren eigenen
 * Cache-Layer (integration_data_cache). Die eigentliche Konsolidierung passiert hier mit
 * `Promise.allSettled` + Concurrency-Pool.
 */

export const maxDuration = 120;

const MARKETPLACES = [
  "amazon",
  "ebay",
  "otto",
  "kaufland",
  "fressnapf",
  "mediamarkt-saturn",
  "zooplus",
  "tiktok",
  "shopify",
] as const;

type Marketplace = (typeof MARKETPLACES)[number];

const querySchema = z.object({
  fromYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  toYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
});

type MarketplaceResult = {
  status: "ok" | "error";
  data?: unknown;
  error?: string;
  durationMs: number;
};

type OverviewResponse = {
  period: { from: string; to: string };
  marketplaces: Record<Marketplace, MarketplaceResult>;
};

async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function next(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

async function fetchMarketplaceSales(args: {
  request: Request;
  slug: Marketplace;
  fromYmd: string;
  toYmd: string;
}): Promise<MarketplaceResult> {
  const start = Date.now();
  const url = new URL(args.request.url);
  const salesUrl = new URL(`/api/${args.slug}/sales`, url.origin);
  salesUrl.searchParams.set("fromYmd", args.fromYmd);
  salesUrl.searchParams.set("toYmd", args.toYmd);

  const cookie = args.request.headers.get("cookie") ?? "";
  try {
    const res = await fetch(salesUrl.toString(), {
      headers: cookie ? { cookie } : {},
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        status: "error",
        error: `HTTP ${res.status}`,
        durationMs: Date.now() - start,
      };
    }
    const data = (await res.json()) as unknown;
    return { status: "ok", data, durationMs: Date.now() - start };
  } catch (e) {
    return {
      status: "error",
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    };
  }
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return apiUnauthenticated();

  const query = parseSearchParams(new URL(request.url), querySchema);
  if (!query.ok) return query.response;

  const { fromYmd, toYmd } = query.data;
  if (fromYmd > toYmd) {
    return NextResponse.json(
      { error: "fromYmd darf nicht nach toYmd liegen." },
      { status: 400 }
    );
  }

  const results = await runPool(MARKETPLACES, 3, (slug) =>
    fetchMarketplaceSales({ request, slug, fromYmd, toYmd })
  );

  const marketplaces = {} as Record<Marketplace, MarketplaceResult>;
  MARKETPLACES.forEach((slug, idx) => {
    marketplaces[slug] = results[idx];
  });

  const payload: OverviewResponse = {
    period: { from: fromYmd, to: toYmd },
    marketplaces,
  };
  return apiOk(payload);
}
