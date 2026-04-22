import type { OttoOrder } from "@/shared/lib/ottoApiClient";

export type MarketplaceArticleSalesRow = {
  key: string;
  title: string;
  unitsCurrent: number;
  unitsPrevious: number;
  /** Prozent; null wenn Vorperiode 0 und keine sinnvolle Rate */
  unitsDeltaPct: number | null;
  revenueCurrent: number;
  revenuePrevious: number;
  avgPriceCurrent: number | null;
  avgPricePrevious: number | null;
};

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pickStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

type LineAgg = { key: string; title: string; units: number; revenue: number };

function mergeKey(sku: string, title: string): string {
  const k = sku || title;
  return k || "—";
}

/** Zeilen aus Flex-/Mirakl-/Shopify-Roherbestellung (gleiche Heuristik wie normalizeFlexOrder). */
export function extractLinesFromFlexRawOrder(raw: unknown, amountScale: number): LineAgg[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const lines = o.line_items ?? o.lineItems ?? o.order_lines ?? o.items ?? o.positions;
  if (!Array.isArray(lines) || lines.length === 0) {
    return [];
  }
  const out: LineAgg[] = [];
  for (const line of lines) {
    if (!line || typeof line !== "object") continue;
    const L = line as Record<string, unknown>;
    const sku = pickStr(
      L.sku ?? L.seller_sku ?? L.sellerSku ?? L.offer_id ?? L.offer_sku ?? L.product_id ?? L.productId
    );
    const title = pickStr(
      L.title ?? L.name ?? L.product_name ?? L.productName ?? L.product_title ?? L.line_item_title
    );
    const qtyRaw = L.quantity ?? L.qty ?? L.quantity_ordered ?? L.count;
    const qty = Math.max(1, toNum(qtyRaw) || 1);

    let lineAmount = 0;
    const total = L.total ?? L.line_total ?? L.line_price ?? L.price ?? L.discounted_price;
    if (typeof total === "number") lineAmount = total;
    else if (typeof total === "string") lineAmount = toNum(total);
    else if (total && typeof total === "object") {
      const t = total as Record<string, unknown>;
      const shopMoney = t.shop_money;
      const smAmt =
        shopMoney && typeof shopMoney === "object"
          ? toNum((shopMoney as Record<string, unknown>).amount)
          : 0;
      lineAmount = toNum(t.amount ?? t.value) || smAmt;
    }
    if (lineAmount === 0) {
      const unit = L.unit_price ?? L.price ?? L.item_price;
      if (typeof unit === "number") lineAmount = unit * qty;
      else if (unit && typeof unit === "object") {
        const u = unit as Record<string, unknown>;
        lineAmount = toNum(u.amount ?? u.value) * qty;
      }
    }
    lineAmount = amountScale > 1 ? lineAmount / amountScale : lineAmount;
    lineAmount = Number(lineAmount.toFixed(2));

    const key = mergeKey(sku, title);
    const label = title || sku || key;
    out.push({ key, title: label, units: qty, revenue: lineAmount });
  }
  return out;
}

export function getCreatedMsFromFlexRaw(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const created = String(
    o.created_at ??
      o.created_date ??
      o.createdAt ??
      o.order_date ??
      o.orderDate ??
      o.date ??
      o.placed_at ??
      ""
  );
  if (!created) return null;
  const t = Date.parse(created);
  return Number.isFinite(t) ? t : null;
}

export function extractLinesFromOttoOrder(order: OttoOrder): LineAgg[] {
  const items = order.position_items ?? order.positionItems ?? [];
  if (!Array.isArray(items) || items.length === 0) return [];
  const out: LineAgg[] = [];
  for (const item of items) {
    const it = item as Record<string, unknown>;
    // Otto v4 nested product object: item.product.{sku,title,product_id,name,ean}
    const productObj = (it.product && typeof it.product === "object"
      ? (it.product as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const sku = pickStr(
      it.sku ??
        productObj.sku ??
        it.product_id ??
        it.productId ??
        productObj.product_id ??
        productObj.productId ??
        it.offer_id ??
        productObj.ean ??
        it.position_item_id ??
        it.variant_id
    );
    const title = pickStr(
      it.product_title ??
        it.title ??
        it.name ??
        it.product_name ??
        productObj.title ??
        productObj.name ??
        productObj.product_title
    );
    const reduced = it.item_value_reduced_gross_price ?? it.itemValueReducedGrossPrice;
    const gross = it.item_value_gross_price ?? it.itemValueGrossPrice;
    const price = (reduced ?? gross) as Record<string, unknown> | undefined;
    let revenue = toNum(price?.amount ?? 0);
    revenue = Number(revenue.toFixed(2));
    // Otto: jedes position_item = 1 verkaufte Einheit (kein quantity-Feld).
    const qty = Math.max(1, toNum(it.quantity ?? it.qty) || 1);
    const key = mergeKey(sku, title);
    const label = title || sku || key;
    out.push({ key, title: label, units: qty, revenue });
  }
  return out;
}

export function getOttoOrderCreatedMs(order: OttoOrder): number | null {
  const orderDate =
    typeof order.order_date === "string"
      ? order.order_date
      : typeof order.orderDate === "string"
        ? order.orderDate
        : "";
  if (!orderDate) return null;
  const t = Date.parse(orderDate);
  return Number.isFinite(t) ? t : null;
}

/** Kaufland: eine Order-Unit = eine verkaufte Position. */
export function extractLineFromKauflandUnit(u: Record<string, unknown>, centsToAmount: (c: number) => number): LineAgg {
  const sku = pickStr(u.id_offer ?? u.sku ?? u.supplier_sku ?? u.id_sku);
  const idProduct = u.id_product ?? u.idProduct;
  const skuKey =
    sku ||
    (typeof idProduct === "number" ? String(idProduct) : pickStr(idProduct)) ||
    String(u.id_order_unit ?? "");
  const title = pickStr(
    u.product_title ??
      u.title ??
      u.product_name ??
      (u.product && typeof u.product === "object"
        ? pickStr((u.product as Record<string, unknown>).title)
        : "")
  );
  const cents =
    typeof u.price === "number"
      ? u.price
      : typeof u.revenue_gross === "number"
        ? u.revenue_gross
        : 0;
  const revenue = centsToAmount(cents);
  const key = mergeKey(skuKey, title);
  const label = title || skuKey || key;
  return { key, title: label, units: 1, revenue };
}

export function getKauflandUnitCreatedMs(u: Record<string, unknown>): number | null {
  const raw = u.ts_created_iso;
  if (typeof raw !== "string") return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function addToMap(map: Map<string, { title: string; units: number; revenue: number }>, line: LineAgg) {
  const prev = map.get(line.key) ?? { title: line.title, units: 0, revenue: 0 };
  prev.units += line.units;
  prev.revenue = Number((prev.revenue + line.revenue).toFixed(2));
  if (line.title && line.title !== "—") prev.title = line.title;
  map.set(line.key, prev);
}

export function buildArticleSalesRows(args: {
  currentLines: LineAgg[];
  previousLines: LineAgg[];
}): { rows: MarketplaceArticleSalesRow[]; currency: string } {
  const curMap = new Map<string, { title: string; units: number; revenue: number }>();
  const prevMap = new Map<string, { title: string; units: number; revenue: number }>();
  for (const l of args.currentLines) addToMap(curMap, l);
  for (const l of args.previousLines) addToMap(prevMap, l);

  const keys = new Set<string>([...curMap.keys(), ...prevMap.keys()]);
  const rows: MarketplaceArticleSalesRow[] = [];
  for (const key of keys) {
    const c = curMap.get(key) ?? { title: key, units: 0, revenue: 0 };
    const p = prevMap.get(key) ?? { title: c.title, units: 0, revenue: 0 };
    let unitsDeltaPct: number | null = null;
    if (p.units > 0) {
      unitsDeltaPct = Number((((c.units - p.units) / p.units) * 100).toFixed(1));
    } else if (c.units > 0) {
      unitsDeltaPct = null;
    } else {
      unitsDeltaPct = 0;
    }
    rows.push({
      key,
      title: c.title || p.title || key,
      unitsCurrent: c.units,
      unitsPrevious: p.units,
      unitsDeltaPct,
      revenueCurrent: c.revenue,
      revenuePrevious: p.revenue,
      avgPriceCurrent: c.units > 0 ? Number((c.revenue / c.units).toFixed(2)) : null,
      avgPricePrevious: p.units > 0 ? Number((p.revenue / p.units).toFixed(2)) : null,
    });
  }

  rows.sort((a, b) => {
    if (b.revenueCurrent !== a.revenueCurrent) return b.revenueCurrent - a.revenueCurrent;
    return a.title.localeCompare(b.title);
  });

  return { rows, currency: "EUR" };
}
