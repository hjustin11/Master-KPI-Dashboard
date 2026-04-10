/**
 * Preis und Bestand aus SP-API Listings Items (searchListingsItems / getListingsItem),
 * Felder offers + fulfillmentAvailability.
 */

function parseAmount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function parsePriceScheduleRow(node: unknown): number | null {
  if (!node || typeof node !== "object") return parseAmount(node);
  const o = node as Record<string, unknown>;
  const direct = parseAmount(o.value_with_tax ?? o.value ?? o.amount);
  if (direct != null) return direct;
  const schedule = o.schedule;
  if (Array.isArray(schedule)) {
    for (const entry of schedule) {
      const hit = parsePriceScheduleRow(entry);
      if (hit != null) return hit;
    }
  }
  return null;
}

function priceFromOfferObject(offer: Record<string, unknown>): number | null {
  const tryBlock = (node: unknown): number | null => {
    if (!node || typeof node !== "object") return null;
    const o = node as Record<string, unknown>;
    const direct = parsePriceScheduleRow(node);
    if (direct != null) return direct;
    for (const k of [
      "ListingPrice",
      "RegularPrice",
      "Price",
      "listingPrice",
      "ourPrice",
      "our_price",
      "standard_price",
      "list_price",
      "discounted_price",
      "minimum_seller_allowed_price",
    ]) {
      const nested = o[k];
      const a = parsePriceScheduleRow(nested);
      if (a != null) return a;
    }
    return null;
  };

  const single = tryBlock(offer);
  if (single != null) return single;

  const purch = offer.purchasableOffer ?? offer.purchasable_offer;
  if (purch && typeof purch === "object") {
    const p = purch as Record<string, unknown>;
    for (const k of ["RegularPrice", "ListingPrice", "Price", "ourPrice", "our_price", "audience"]) {
      const hit = tryBlock(p[k]);
      if (hit != null) return hit;
    }
  }
  return null;
}

function extractPriceFromOffers(offers: unknown, marketplaceId?: string): number | null {
  if (!Array.isArray(offers) || offers.length === 0) return null;
  const mp = (marketplaceId ?? "").trim();
  let fallback: number | null = null;
  for (const offer of offers) {
    if (!offer || typeof offer !== "object") continue;
    const o = offer as Record<string, unknown>;
    const hit = priceFromOfferObject(o);
    if (hit == null) continue;
    if (fallback == null) fallback = hit;
    const om = typeof o.marketplaceId === "string" ? o.marketplaceId.trim() : "";
    if (mp && om === mp) return hit;
  }
  return fallback;
}

function extractStockFromFulfillment(fa: unknown): number | null {
  if (!Array.isArray(fa) || fa.length === 0) return null;
  let sum = 0;
  let any = false;
  const extractOne = (raw: unknown): number | null => {
    const parsed = parseAmount(raw);
    if (parsed != null) return Math.trunc(parsed);
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    for (const key of ["amount", "value", "quantity"]) {
      const n = parseAmount(o[key]);
      if (n != null) return Math.trunc(n);
    }
    return null;
  };
  for (const entry of fa) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const raw =
      o.quantity ?? o.fulfillableQuantity ?? o.availableQuantity ?? o.inStockQuantity;
    const n = extractOne(raw);
    if (n != null && Number.isFinite(n) && n >= 0) {
      sum += n;
      any = true;
    }
  }
  return any ? sum : null;
}

export function extractListingsItemPriceAndStock(
  item: unknown,
  options?: { marketplaceId?: string }
): {
  price: number | null;
  stockQty: number | null;
} {
  if (!item || typeof item !== "object") {
    return { price: null, stockQty: null };
  }
  const o = item as Record<string, unknown>;
  return {
    price: extractPriceFromOffers(o.offers, options?.marketplaceId),
    stockQty: extractStockFromFulfillment(o.fulfillmentAvailability),
  };
}
