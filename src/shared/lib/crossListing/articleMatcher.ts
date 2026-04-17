/**
 * Multi-Identifier Article Matching.
 *
 * Ordnet einen Xentral-Artikel einem Marktplatz-Listing zu, auch wenn die SKU
 * abweicht. Verwendet eine 5-stufige Kaskade mit abnehmender Konfidenz.
 */

export type MatchType =
  | "sku_exact"
  | "sku_partial"
  | "ean_exact"
  | "asin_exact"
  | "model_number"
  | "title_fuzzy"
  | "manual";

export type XentralArticle = {
  sku: string;
  ean?: string | null;
  title: string;
  modelNumber?: string | null;
};

export type MatchCandidate = {
  marketplaceSku?: string | null;
  ean?: string | null;
  asin?: string | null;
  modelNumber?: string | null;
  title?: string | null;
  secondaryId?: string | null;
};

export type MatchResult = {
  matched: boolean;
  candidate: MatchCandidate | null;
  matchType: MatchType | null;
  confidence: number;
  reason: string;
};

const STOPWORDS = new Set([
  "der", "die", "das", "und", "oder", "mit", "ohne", "von", "für", "bei", "auf", "in",
  "the", "and", "or", "with", "for", "of", "a", "an",
  "cm", "mm", "g", "kg", "ml", "l", "stück", "stk",
]);

export function normalizeSku(sku: string | null | undefined): string {
  if (!sku) return "";
  return sku.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function normalizeEan(ean: string | null | undefined): string {
  if (!ean) return "";
  const digits = ean.replace(/\D/g, "");
  if (digits.length === 14 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function normalizeAsin(asin: string | null | undefined): string {
  if (!asin) return "";
  return asin.trim().toUpperCase();
}

export function tokenizeTitle(title: string | null | undefined): Set<string> {
  if (!title) return new Set();
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * 5-stage matching cascade. Returns first confident match.
 */
export function matchArticleToCandidate(
  article: XentralArticle,
  candidate: MatchCandidate
): MatchResult {
  const articleSku = normalizeSku(article.sku);
  const candidateSku = normalizeSku(candidate.marketplaceSku);

  if (articleSku && candidateSku && articleSku === candidateSku) {
    return {
      matched: true,
      candidate,
      matchType: "sku_exact",
      confidence: 1.0,
      reason: `SKU exakt: ${article.sku} = ${candidate.marketplaceSku}`,
    };
  }

  if (articleSku && candidateSku && (articleSku.includes(candidateSku) || candidateSku.includes(articleSku))) {
    const shorter = Math.min(articleSku.length, candidateSku.length);
    const longer = Math.max(articleSku.length, candidateSku.length);
    if (shorter >= 4 && shorter / longer >= 0.6) {
      return {
        matched: true,
        candidate,
        matchType: "sku_partial",
        confidence: 0.9,
        reason: `SKU teilweise: ${article.sku} ≈ ${candidate.marketplaceSku}`,
      };
    }
  }

  const articleEan = normalizeEan(article.ean);
  const candidateEan = normalizeEan(candidate.ean);
  if (articleEan && candidateEan && articleEan === candidateEan) {
    return {
      matched: true,
      candidate,
      matchType: "ean_exact",
      confidence: 0.95,
      reason: `EAN exakt: ${articleEan}`,
    };
  }

  if (candidate.asin) {
    const candidateAsin = normalizeAsin(candidate.asin);
    const articleAsinField = normalizeAsin((article as unknown as { asin?: string }).asin ?? null);
    if (articleAsinField && candidateAsin && articleAsinField === candidateAsin) {
      return {
        matched: true,
        candidate,
        matchType: "asin_exact",
        confidence: 0.95,
        reason: `ASIN exakt: ${candidateAsin}`,
      };
    }
  }

  const articleModel = (article.modelNumber ?? "").trim().toLowerCase();
  const candidateModel = (candidate.modelNumber ?? "").trim().toLowerCase();
  if (articleModel && candidateModel && articleModel.length >= 3) {
    if (articleModel === candidateModel) {
      return {
        matched: true,
        candidate,
        matchType: "model_number",
        confidence: 0.85,
        reason: `Modellnr. exakt: ${articleModel}`,
      };
    }
    const dist = levenshtein(articleModel, candidateModel);
    if (dist <= 2 && articleModel.length >= 5) {
      return {
        matched: true,
        candidate,
        matchType: "model_number",
        confidence: 0.8,
        reason: `Modellnr. ähnlich (Dist ${dist}): ${articleModel} ≈ ${candidateModel}`,
      };
    }
  }

  const articleTokens = tokenizeTitle(article.title);
  const candidateTokens = tokenizeTitle(candidate.title);
  const sim = jaccardSimilarity(articleTokens, candidateTokens);
  if (sim >= 0.5 && articleTokens.size >= 2) {
    const confidence = Math.min(0.8, 0.6 + (sim - 0.5) * 0.6);
    return {
      matched: true,
      candidate,
      matchType: "title_fuzzy",
      confidence,
      reason: `Titel ähnlich (Jaccard ${sim.toFixed(2)})`,
    };
  }

  return {
    matched: false,
    candidate: null,
    matchType: null,
    confidence: 0,
    reason: "Keine Übereinstimmung",
  };
}

/**
 * Match against many candidates, return the best result.
 */
export function matchArticleToMarketplace(
  article: XentralArticle,
  candidates: MatchCandidate[]
): MatchResult {
  let best: MatchResult = {
    matched: false,
    candidate: null,
    matchType: null,
    confidence: 0,
    reason: "Keine Übereinstimmung",
  };

  for (const candidate of candidates) {
    const result = matchArticleToCandidate(article, candidate);
    if (result.matched && result.confidence > best.confidence) {
      best = result;
      if (best.confidence >= 1.0) break;
    }
  }

  return best;
}
