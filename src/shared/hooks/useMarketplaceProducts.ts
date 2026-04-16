"use client";

import { useState, useEffect } from "react";

export type ProductStatus = "bestseller" | "newcomer" | "losing_ground" | "reviving" | "sunset" | "stable";

export type ProductRow = {
  sku: string;
  name: string;
  revenueCurrent: number;
  revenuePrevious: number;
  ordersCurrent: number;
  ordersPrevious: number;
  returnsCurrent: number;
  returnsPrevious: number;
  deltaPct: number;
  status: ProductStatus;
};

export type ProductsData = {
  products: ProductRow[];
  summary: { totalSkus: number; newcomers: number; losingGround: number; sunsets: number };
};

export default function useMarketplaceProducts(slug: string, from?: string, to?: string) {
  const [data, setData] = useState<ProductsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const res = await fetch(`/api/marketplace-detail/${slug}/products?${params.toString()}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled) setData(json as ProductsData);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [slug, from, to]);

  return { data, loading };
}
