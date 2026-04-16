/**
 * Regelbasierte (deterministische) Listing-Optimierung — läuft automatisch nach
 * dem Merge, VOR der optionalen LLM-Optimierung. Pure Funktionen, keine I/O.
 *
 * Scope V1:
 *  - Marktplatz-spezifische Titel-Kürzung + Sonderzeichen-Filter
 *  - Bullet-Normalisierung (trim, dedup, max-items, max-length)
 *  - Shopify SEO-Titel/-Beschreibung aus Titel/Beschreibung ableiten
 *  - Condition-Default setzen wenn leer
 */

import type {
  CrossListingDraftValues,
  CrossListingTargetSlug,
} from "./crossListingDraftTypes";

const AMAZON_TITLE_MAX = 200;
const EBAY_TITLE_MAX = 80;
const TIKTOK_TITLE_MAX = 100;

const BANNED_TITLE_CHARS_AMAZON = /[!?€™®]+/g;

export function stripBannedTitleChars(title: string, slug: CrossListingTargetSlug): string {
  if (slug !== "amazon" && slug !== "ebay") return title;
  return title.replace(BANNED_TITLE_CHARS_AMAZON, "").replace(/\s+/g, " ").trim();
}

export function clampTitleForTarget(title: string, slug: CrossListingTargetSlug): string {
  const cleaned = stripBannedTitleChars(title, slug).trim();
  if (!cleaned) return "";
  const max =
    slug === "amazon"
      ? AMAZON_TITLE_MAX
      : slug === "ebay"
        ? EBAY_TITLE_MAX
        : slug === "tiktok"
          ? TIKTOK_TITLE_MAX
          : cleaned.length;
  if (cleaned.length <= max) return cleaned;
  // Kürzen am letzten Wort-Boundary vor dem Limit, nicht mitten im Wort.
  const slice = cleaned.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const out = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return out.trim();
}

export function prefixBrand(title: string, brand: string): string {
  const t = title.trim();
  const b = brand.trim();
  if (!t || !b) return t;
  const lower = t.toLowerCase();
  if (lower.startsWith(b.toLowerCase())) return t;
  return `${b} ${t}`;
}

export function normalizeBullets(
  bullets: readonly string[],
  maxItems: number,
  maxLength: number
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of bullets) {
    if (out.length >= maxItems) break;
    const trimmed = raw.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const truncated = trimmed.length > maxLength ? trimmed.slice(0, maxLength).trim() : trimmed;
    const key = truncated.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(truncated);
  }
  return out;
}

export function deriveSeoTitle(title: string, shopSuffix = " | astropet.de"): string {
  const max = 70;
  const t = title.trim();
  if (!t) return "";
  const withSuffix = t + shopSuffix;
  if (withSuffix.length <= max) return withSuffix;
  const available = max - shopSuffix.length;
  if (available <= 10) return t.slice(0, max).trim();
  const slice = t.slice(0, available);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > available * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${base.trim()}${shopSuffix}`;
}

export function deriveSeoDescription(description: string): string {
  const max = 160;
  const flat = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= max) return flat;
  const slice = flat.slice(0, max);
  const lastDot = slice.lastIndexOf(". ");
  const lastSpace = slice.lastIndexOf(" ");
  if (lastDot > max * 0.6) return slice.slice(0, lastDot + 1).trim();
  if (lastSpace > max * 0.6) return `${slice.slice(0, lastSpace).trim()}…`;
  return `${slice.trim()}…`;
}

export type OptimizeForTargetResult = {
  values: CrossListingDraftValues;
  changed: Partial<Record<keyof CrossListingDraftValues, true>>;
};

/**
 * Wendet alle regelbasierten Transformationen auf ein Draft-Values-Objekt an.
 * Gibt das neue Objekt + Flags zurück, welche Felder geändert wurden.
 */
export function optimizeForTarget(
  values: CrossListingDraftValues,
  slug: CrossListingTargetSlug,
  options: { shopifySuffix?: string } = {}
): OptimizeForTargetResult {
  const changed: OptimizeForTargetResult["changed"] = {};
  const next: CrossListingDraftValues = { ...values };

  // Titel mit Brand-Prefix + Clamping
  if (values.title) {
    const prefixed = values.brand ? prefixBrand(values.title, values.brand) : values.title;
    const clamped = clampTitleForTarget(prefixed, slug);
    if (clamped && clamped !== values.title) {
      next.title = clamped;
      changed.title = true;
    }
  }

  // Bullets normalisieren (Amazon 5×500, eBay 6×300, sonst 10×400)
  if (values.bullets.length > 0) {
    const caps =
      slug === "amazon"
        ? { items: 5, length: 500 }
        : slug === "ebay"
          ? { items: 6, length: 300 }
          : { items: 10, length: 400 };
    const normalized = normalizeBullets(values.bullets, caps.items, caps.length);
    if (normalized.join("\n") !== values.bullets.join("\n")) {
      next.bullets = normalized;
      changed.bullets = true;
    }
  }

  // Shopify: SEO-Felder ableiten, wenn leer
  if (slug === "shopify") {
    if (!values.seoTitle && values.title) {
      const derived = deriveSeoTitle(values.title, options.shopifySuffix);
      if (derived) {
        next.seoTitle = derived;
        changed.seoTitle = true;
      }
    }
    if (!values.seoDescription && values.description) {
      const derived = deriveSeoDescription(values.description);
      if (derived) {
        next.seoDescription = derived;
        changed.seoDescription = true;
      }
    }
  }

  // Condition-Default
  if (!values.condition) {
    next.condition = "Neu";
    changed.condition = true;
  }

  return { values: next, changed };
}
