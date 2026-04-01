/**
 * Deep-Links vom Dashboard ins jeweilige Seller-Portal (z. B. Amazon Seller Central, Kaufland).
 * Nur URLs bauen, wenn Bestellnummer und Marktplatz plausibel passen — keine Raten.
 *
 * Reihenfolge: zuerst expliziter Marktplatz-Name (Xentral-Projekt), damit z. B. eBay nicht
 * fälschlich als Amazon behandelt wird. Abschluss: Amazon-ID-Muster ohne erkannten MP.
 */

/** Amazon Marketplace Order ID: drei Blöcke mit Bindestrich (z. B. 305-1470017-7665135). */
const AMAZON_ORDER_ID_RE = /^\d{3}-\d{7}-\d{7}$/;

/** Kaufland u. ä.: alphanumerische Auftragsreferenz ohne Amazon-Muster. */
const KAUFLAND_STYLE_ORDER_ID_RE = /^[A-Z0-9]{5,24}$/i;

/** TikTok Shop: oft lange numerische Order-ID. */
const TIKTOK_NUMERIC_ORDER_ID_RE = /^\d{10,22}$/;

/** Shopify Admin: numerische Order-ID. */
const SHOPIFY_NUMERIC_ORDER_ID_RE = /^\d{6,20}$/;

function normalizeMarketplaceLabel(marketplace: string): string {
  return marketplace.trim().toUpperCase().replace(/\s+/g, " ");
}

function expandOrderIdTemplate(template: string, orderId: string): string {
  return template.trim().replace(/\{orderId\}/g, encodeURIComponent(orderId));
}

function readPublicEnv(key: string): string {
  if (typeof process === "undefined" || !process.env[key]) return "";
  return String(process.env[key]).trim();
}

export function trimMarketplaceOrderId(raw: string): string {
  return raw.replace(/^[\s\u00a0\t]+|[\s\u00a0\t]+$/g, "").trim();
}

export function looksLikeAmazonOrderId(raw: string): boolean {
  return AMAZON_ORDER_ID_RE.test(trimMarketplaceOrderId(raw));
}

function isAmazonFamilyMarketplace(mp: string): boolean {
  if (!mp || mp === "—") return false;
  const u = normalizeMarketplaceLabel(mp);
  return (
    u.includes("AMAZON") ||
    u.includes("AMZ-FBA") ||
    u.includes("AMZ-FBM") ||
    u === "AMZ" ||
    u.endsWith(" AMZ")
  );
}

/**
 * Seller Central (DE): nach Login öffnet die Bestellung — gleiches ID-Format wie in Xentral/SP-API.
 * Bei Bedarf Host anpassen (z. B. sellercentral-europe.amazon.com).
 */
export function amazonSellerCentralOrderUrl(orderId: string): string {
  const id = trimMarketplaceOrderId(orderId);
  return `https://sellercentral.amazon.de/orders-v3/order/${encodeURIComponent(id)}`;
}

/**
 * Liefert eine https-URL oder null, wenn keine sichere Zuordnung möglich ist.
 * Zusätzliche Marktplätze über NEXT_PUBLIC_*_ORDER_URL_TEMPLATE mit Platzhalter {orderId}.
 */
export function resolveSellerPortalOrderUrl(marketplace: string, internetNumberRaw: string): string | null {
  const id = trimMarketplaceOrderId(internetNumberRaw);
  if (!id || id === "—") return null;
  const mp = normalizeMarketplaceLabel(marketplace);

  if (isAmazonFamilyMarketplace(mp)) {
    if (looksLikeAmazonOrderId(id)) return amazonSellerCentralOrderUrl(id);
    return null;
  }

  if (mp.includes("EBAY")) {
    const ebayTpl = readPublicEnv("NEXT_PUBLIC_EBAY_ORDER_URL_TEMPLATE");
    if (ebayTpl.includes("{orderId}")) return expandOrderIdTemplate(ebayTpl, id);
    return `https://www.ebay.de/sh/ord/details?orderid=${encodeURIComponent(id)}`;
  }

  const kauflandTpl = readPublicEnv("NEXT_PUBLIC_KAUFLAND_ORDER_URL_TEMPLATE");
  if (
    kauflandTpl.includes("{orderId}") &&
    (mp.includes("KAUFLAND") || mp === "KL" || mp.endsWith(" KL"))
  ) {
    return expandOrderIdTemplate(kauflandTpl, id);
  }
  if ((mp.includes("KAUFLAND") || mp === "KL") && KAUFLAND_STYLE_ORDER_ID_RE.test(id)) {
    return `https://seller.kaufland.com/de/orders/${encodeURIComponent(id)}`;
  }

  const tiktokTpl = readPublicEnv("NEXT_PUBLIC_TIKTOK_ORDER_URL_TEMPLATE");
  if (tiktokTpl.includes("{orderId}") && (mp.includes("TIKTOK") || mp.includes("TT"))) {
    return expandOrderIdTemplate(tiktokTpl, id);
  }
  if ((mp.includes("TIKTOK") || mp.includes("TT")) && TIKTOK_NUMERIC_ORDER_ID_RE.test(id)) {
    return `https://seller.tiktokglobalshop.com/order/detail?order_id=${encodeURIComponent(id)}`;
  }

  const shopifyTpl = readPublicEnv("NEXT_PUBLIC_SHOPIFY_ORDER_URL_TEMPLATE");
  if (shopifyTpl.includes("{orderId}") && mp.includes("SHOPIFY")) {
    return expandOrderIdTemplate(shopifyTpl, id);
  }
  if (mp.includes("SHOPIFY") && SHOPIFY_NUMERIC_ORDER_ID_RE.test(id)) {
    const store = readPublicEnv("NEXT_PUBLIC_SHOPIFY_ADMIN_STORE_HANDLE");
    if (store) {
      return `https://admin.shopify.com/store/${encodeURIComponent(store)}/orders/${encodeURIComponent(id)}`;
    }
  }

  const ottoTpl = readPublicEnv("NEXT_PUBLIC_OTTO_ORDER_URL_TEMPLATE");
  if (ottoTpl.includes("{orderId}") && mp.includes("OTTO")) {
    return expandOrderIdTemplate(ottoTpl, id);
  }

  const fressnapfTpl = readPublicEnv("NEXT_PUBLIC_FRESSNAPF_ORDER_URL_TEMPLATE");
  if (
    fressnapfTpl.includes("{orderId}") &&
    (mp.includes("FRESSNAPF") || mp.includes("FRESS") || mp === "FN" || mp.endsWith(" FN"))
  ) {
    return expandOrderIdTemplate(fressnapfTpl, id);
  }

  const zooplusTpl = readPublicEnv("NEXT_PUBLIC_ZOOPLUS_ORDER_URL_TEMPLATE");
  if (
    zooplusTpl.includes("{orderId}") &&
    (mp.includes("ZOOPLUS") || (mp.includes("ZOO") && mp.includes("PLUS")))
  ) {
    return expandOrderIdTemplate(zooplusTpl, id);
  }

  const mmsTpl =
    readPublicEnv("NEXT_PUBLIC_MEDIAMARKT_SATURN_ORDER_URL_TEMPLATE") ||
    readPublicEnv("NEXT_PUBLIC_MMS_ORDER_URL_TEMPLATE");
  if (
    mmsTpl.includes("{orderId}") &&
    (mp.includes("MEDIAMARKT") ||
      mp.includes("SATURN") ||
      mp.includes("MEDIA MARKT") ||
      mp === "MMS")
  ) {
    return expandOrderIdTemplate(mmsTpl, id);
  }

  if (looksLikeAmazonOrderId(id)) {
    return amazonSellerCentralOrderUrl(id);
  }

  return null;
}
