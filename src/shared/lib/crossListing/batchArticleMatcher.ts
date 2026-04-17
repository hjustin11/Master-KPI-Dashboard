/**
 * Batch-Variante des Article-Matchers mit Index-Map-Optimierung.
 * Baut einmalig Lookup-Maps, iteriert dann O(n) über die Artikel.
 */

import {
  matchArticleToCandidate,
  normalizeEan,
  normalizeSku,
  tokenizeTitle,
  jaccardSimilarity,
  type MatchCandidate,
  type MatchResult,
  type XentralArticle,
} from "./articleMatcher";

export type BatchMatchEntry = {
  article: XentralArticle;
  result: MatchResult;
};

type CandidateIndex = {
  bySku: Map<string, MatchCandidate>;
  byEan: Map<string, MatchCandidate>;
  byAsin: Map<string, MatchCandidate>;
  byModel: Map<string, MatchCandidate>;
  all: MatchCandidate[];
};

function buildIndex(candidates: MatchCandidate[]): CandidateIndex {
  const bySku = new Map<string, MatchCandidate>();
  const byEan = new Map<string, MatchCandidate>();
  const byAsin = new Map<string, MatchCandidate>();
  const byModel = new Map<string, MatchCandidate>();

  for (const c of candidates) {
    const sku = normalizeSku(c.marketplaceSku);
    if (sku) bySku.set(sku, c);
    const ean = normalizeEan(c.ean);
    if (ean) byEan.set(ean, c);
    if (c.asin) byAsin.set(c.asin.trim().toUpperCase(), c);
    const model = (c.modelNumber ?? "").trim().toLowerCase();
    if (model.length >= 3) byModel.set(model, c);
  }

  return { bySku, byEan, byAsin, byModel, all: candidates };
}

function fastLookup(article: XentralArticle, index: CandidateIndex): MatchResult | null {
  const sku = normalizeSku(article.sku);
  if (sku) {
    const hit = index.bySku.get(sku);
    if (hit) {
      return {
        matched: true,
        candidate: hit,
        matchType: "sku_exact",
        confidence: 1.0,
        reason: `SKU exakt: ${article.sku}`,
      };
    }
  }

  const ean = normalizeEan(article.ean);
  if (ean) {
    const hit = index.byEan.get(ean);
    if (hit) {
      return {
        matched: true,
        candidate: hit,
        matchType: "ean_exact",
        confidence: 0.95,
        reason: `EAN exakt: ${ean}`,
      };
    }
  }

  const model = (article.modelNumber ?? "").trim().toLowerCase();
  if (model.length >= 3) {
    const hit = index.byModel.get(model);
    if (hit) {
      return {
        matched: true,
        candidate: hit,
        matchType: "model_number",
        confidence: 0.85,
        reason: `Modellnr. exakt: ${model}`,
      };
    }
  }

  return null;
}

/**
 * Matcht viele Artikel gegen viele Kandidaten in O(n + m + n*k_fuzzy) statt O(n*m).
 * k_fuzzy ist deutlich kleiner als m, da Fast-Path die meisten Artikel direkt auflöst.
 */
export function batchMatchArticles(
  articles: XentralArticle[],
  candidates: MatchCandidate[]
): BatchMatchEntry[] {
  if (!candidates.length) {
    return articles.map((article) => ({
      article,
      result: {
        matched: false,
        candidate: null,
        matchType: null,
        confidence: 0,
        reason: "Keine Kandidaten verfügbar",
      },
    }));
  }

  const index = buildIndex(candidates);
  const results: BatchMatchEntry[] = [];

  for (const article of articles) {
    const fast = fastLookup(article, index);
    if (fast) {
      results.push({ article, result: fast });
      continue;
    }

    let best: MatchResult = {
      matched: false,
      candidate: null,
      matchType: null,
      confidence: 0,
      reason: "Keine Übereinstimmung",
    };

    const articleTokens = tokenizeTitle(article.title);

    for (const candidate of index.all) {
      const candidateTokens = tokenizeTitle(candidate.title);
      const sim = jaccardSimilarity(articleTokens, candidateTokens);
      if (sim >= 0.5 && articleTokens.size >= 2) {
        const result = matchArticleToCandidate(article, candidate);
        if (result.matched && result.confidence > best.confidence) {
          best = result;
          if (best.confidence >= 0.95) break;
        }
      } else {
        const result = matchArticleToCandidate(article, candidate);
        if (result.matched && result.confidence > best.confidence) {
          best = result;
          if (best.confidence >= 0.95) break;
        }
      }
    }

    results.push({ article, result: best });
  }

  return results;
}
