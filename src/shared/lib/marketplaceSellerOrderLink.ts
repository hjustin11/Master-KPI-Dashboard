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
const OTTO_STYLE_ORDER_ID_RE = /^\d{8,16}-[A-Z]$/i;
const SHOPIFY_NAME_STYLE_ORDER_ID_RE = /^(?:#)?[a-z0-9][a-z0-9._-]{3,}$/i;

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

function readAnyEnv(keys: string[]): string {
  for (const key of keys) {
    const value = readPublicEnv(key);
    if (value) return value;
  }
  return "";
}

function normalizeHttpsOrigin(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function miraklOperatorOrderUrl(baseUrlRaw: string, orderId: string): string | null {
  const origin = normalizeHttpsOrigin(baseUrlRaw);
  if (!origin) return null;
  return `${origin}/mmp/operator/orders/${encodeURIComponent(orderId)}`;
}

function resolveShopifyStoreHandle(): string {
  const explicit = readAnyEnv([
    "NEXT_PUBLIC_SHOPIFY_ADMIN_STORE_HANDLE",
    "SHOPIFY_ADMIN_STORE_HANDLE",
  ]);
  if (explicit) return explicit;
  const shopifyApiBaseUrl = readAnyEnv(["SHOPIFY_API_BASE_URL", "NEXT_PUBLIC_SHOPIFY_API_BASE_URL"]);
  try {
    const host = new URL(shopifyApiBaseUrl).hostname.toLowerCase();
    if (host.endsWith(".myshopify.com")) {
      return host.split(".")[0] ?? "";
    }
  } catch {
    // ignore
  }
  return "";
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
    const ebayTpl = readAnyEnv(["NEXT_PUBLIC_EBAY_ORDER_URL_TEMPLATE", "EBAY_ORDER_URL_TEMPLATE"]);
    if (ebayTpl.includes("{orderId}")) return expandOrderIdTemplate(ebayTpl, id);
    return `https://www.ebay.de/sh/ord/details?orderid=${encodeURIComponent(id)}`;
  }

  const kauflandTpl = readAnyEnv([
    "NEXT_PUBLIC_KAUFLAND_ORDER_URL_TEMPLATE",
    "KAUFLAND_ORDER_URL_TEMPLATE",
  ]);
  if (
    kauflandTpl.includes("{orderId}") &&
    (mp.includes("KAUFLAND") || mp === "KL" || mp.endsWith(" KL"))
  ) {
    return expandOrderIdTemplate(kauflandTpl, id);
  }
  if ((mp.includes("KAUFLAND") || mp === "KL") && KAUFLAND_STYLE_ORDER_ID_RE.test(id)) {
    return `https://seller.kaufland.com/de/orders/${encodeURIComponent(id)}`;
  }

  const tiktokTpl = readAnyEnv(["NEXT_PUBLIC_TIKTOK_ORDER_URL_TEMPLATE", "TIKTOK_ORDER_URL_TEMPLATE"]);
  if (tiktokTpl.includes("{orderId}") && (mp.includes("TIKTOK") || mp.includes("TT"))) {
    return expandOrderIdTemplate(tiktokTpl, id);
  }
  if ((mp.includes("TIKTOK") || mp.includes("TT")) && TIKTOK_NUMERIC_ORDER_ID_RE.test(id)) {
    return `https://seller.tiktokglobalshop.com/order/detail?order_id=${encodeURIComponent(id)}`;
  }

  const shopifyTpl = readAnyEnv([
    "NEXT_PUBLIC_SHOPIFY_ORDER_URL_TEMPLATE",
    "SHOPIFY_ORDER_URL_TEMPLATE",
  ]);
  if (shopifyTpl.includes("{orderId}") && mp.includes("SHOPIFY")) {
    return expandOrderIdTemplate(shopifyTpl, id);
  }
  if (mp.includes("SHOPIFY")) {
    const store = resolveShopifyStoreHandle();
    if (store) {
      return `https://admin.shopify.com/store/${encodeURIComponent(store)}/orders/${encodeURIComponent(id)}`;
    }
    if (SHOPIFY_NAME_STYLE_ORDER_ID_RE.test(id)) {
      return `https://admin.shopify.com/orders?query=${encodeURIComponent(id)}`;
    }
  }

  const ottoTpl = readAnyEnv(["NEXT_PUBLIC_OTTO_ORDER_URL_TEMPLATE", "OTTO_ORDER_URL_TEMPLATE"]);
  if (ottoTpl.includes("{orderId}") && mp.includes("OTTO")) {
    return expandOrderIdTemplate(ottoTpl, id);
  }
  if (mp.includes("OTTO")) {
    return `https://partner.otto.market/orders/${encodeURIComponent(id)}`;
  }

  const fressnapfTpl = readAnyEnv([
    "NEXT_PUBLIC_FRESSNAPF_ORDER_URL_TEMPLATE",
    "FRESSNAPF_ORDER_URL_TEMPLATE",
  ]);
  if (
    fressnapfTpl.includes("{orderId}") &&
    (mp.includes("FRESSNAPF") || mp.includes("FRESS") || mp === "FN" || mp.endsWith(" FN"))
  ) {
    return expandOrderIdTemplate(fressnapfTpl, id);
  }
  if (mp.includes("FRESSNAPF") || mp.includes("FRESS") || mp === "FN" || mp.endsWith(" FN")) {
    const fallback = miraklOperatorOrderUrl(
      readAnyEnv(["FRESSNAPF_API_BASE_URL", "NEXT_PUBLIC_FRESSNAPF_API_BASE_URL"]),
      id
    );
    if (fallback) return fallback;
  }

  const zooplusTpl = readAnyEnv(["NEXT_PUBLIC_ZOOPLUS_ORDER_URL_TEMPLATE", "ZOOPLUS_ORDER_URL_TEMPLATE"]);
  if (
    zooplusTpl.includes("{orderId}") &&
    (mp.includes("ZOOPLUS") || (mp.includes("ZOO") && mp.includes("PLUS")))
  ) {
    return expandOrderIdTemplate(zooplusTpl, id);
  }
  if (mp.includes("ZOOPLUS") || (mp.includes("ZOO") && mp.includes("PLUS"))) {
    const fallback = miraklOperatorOrderUrl(
      readAnyEnv(["ZOOPLUS_API_BASE_URL", "NEXT_PUBLIC_ZOOPLUS_API_BASE_URL"]),
      id
    );
    if (fallback) return fallback;
  }

  const mmsTpl =
    readAnyEnv(["NEXT_PUBLIC_MEDIAMARKT_SATURN_ORDER_URL_TEMPLATE", "MEDIAMARKT_SATURN_ORDER_URL_TEMPLATE"]) ||
    readAnyEnv(["NEXT_PUBLIC_MMS_ORDER_URL_TEMPLATE", "MMS_ORDER_URL_TEMPLATE"]);
  if (
    mmsTpl.includes("{orderId}") &&
    (mp.includes("MEDIAMARKT") ||
      mp.includes("SATURN") ||
      mp.includes("MEDIA MARKT") ||
      mp === "MMS")
  ) {
    return expandOrderIdTemplate(mmsTpl, id);
  }
  if (mp.includes("MEDIAMARKT") || mp.includes("SATURN") || mp.includes("MEDIA MARKT") || mp === "MMS") {
    const fallback = miraklOperatorOrderUrl(readAnyEnv(["MMS_API_BASE_URL", "NEXT_PUBLIC_MMS_API_BASE_URL"]), id);
    if (fallback) return fallback;
  }

  if (looksLikeAmazonOrderId(id)) {
    return amazonSellerCentralOrderUrl(id);
  }

  // Xentral kann bei manchen Importen Marketplace-Labels ohne klaren Namen liefern.
  // Dann versuchen wir über ID-Muster einen sicheren Portal-Link.
  if (OTTO_STYLE_ORDER_ID_RE.test(id)) {
    return `https://partner.otto.market/orders/${encodeURIComponent(id)}`;
  }
  if (SHOPIFY_NAME_STYLE_ORDER_ID_RE.test(id)) {
    const store = resolveShopifyStoreHandle();
    if (store) {
      return `https://admin.shopify.com/store/${encodeURIComponent(store)}/orders?query=${encodeURIComponent(id)}`;
    }
    return `https://admin.shopify.com/orders?query=${encodeURIComponent(id)}`;
  }

  return null;
}
