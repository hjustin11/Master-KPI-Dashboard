/**
 * Kontext für LLM-Titelprüfung: Amazon-Entwurf + Shopify (AstroPet-Shop) + gekürztes Regelwerk.
 */

export type AmazonTitleShopifyContext = {
  title: string;
  descriptionExcerpt: string;
  tags: string[];
  vendor: string;
  productType: string;
  storefrontUrl: string;
};

export type AmazonTitleProductContext = {
  sku: string;
  asin: string;
  currentAmazonTitle: string;
  brand: string;
  productType: string;
  conditionType: string;
  bulletPoints: string[];
  descriptionExcerpt: string;
  attributes: Record<string, string>;
  externalProductId: string;
  externalProductIdType: string;
  shopify: AmazonTitleShopifyContext | null;
};

const DESC_MAX = 3500;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Extrahiert Regelwerk-Abschnitte rund um Titel/Listung; sonst Anfang des Dokuments.
 */
export function buildRulebookExcerptForTitleLlm(fullMarkdown: string, maxChars = 14000): string {
  const md = fullMarkdown.trim();
  if (!md) return "";

  const lines = md.split("\n");
  const titleish = (line: string): boolean => {
    const h = line.replace(/^#+\s*/, "").trim().toLowerCase();
    return (
      /\btitel\b/.test(h) ||
      /\blisting\b/.test(h) ||
      /\bprodukttitel\b/.test(h) ||
      /\bamazon.*titel\b/.test(h)
    );
  };

  const startIdx = lines.findIndex((l) => /^#{1,3}\s/.test(l) && titleish(l));
  if (startIdx >= 0) {
    const out: string[] = [];
    for (let i = startIdx; i < lines.length; i += 1) {
      const line = lines[i];
      if (i > startIdx && /^#\s[^#]/.test(line)) break;
      out.push(line);
      if (out.join("\n").length > maxChars) break;
    }
    const block = out.join("\n").trim();
    if (block.length >= 80) return clip(block, maxChars);
  }

  return clip(md, maxChars);
}

export function buildAmazonTitleProductContext(args: {
  sku: string;
  amazon: {
    title: string;
    description: string;
    bulletPoints: string[];
    brand: string;
    productType: string;
    asin: string;
    externalProductId: string;
    externalProductIdType: string;
    conditionType: string;
    attributes: Record<string, string>;
  };
  shopify: AmazonTitleShopifyContext | null;
}): AmazonTitleProductContext {
  const { sku, amazon, shopify } = args;
  return {
    sku,
    asin: amazon.asin.trim(),
    currentAmazonTitle: amazon.title.trim(),
    brand: amazon.brand.trim(),
    productType: amazon.productType.trim(),
    conditionType: amazon.conditionType.trim(),
    bulletPoints: amazon.bulletPoints.filter(Boolean),
    descriptionExcerpt: clip(amazon.description, DESC_MAX),
    attributes: amazon.attributes,
    externalProductId: amazon.externalProductId.trim(),
    externalProductIdType: amazon.externalProductIdType,
    shopify,
  };
}
