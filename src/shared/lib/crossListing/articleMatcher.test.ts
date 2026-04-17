import { describe, it, expect } from "vitest";
import {
  matchArticleToCandidate,
  matchArticleToMarketplace,
  normalizeEan,
  normalizeSku,
  jaccardSimilarity,
  tokenizeTitle,
  levenshtein,
  type MatchCandidate,
  type XentralArticle,
} from "./articleMatcher";
import { batchMatchArticles } from "./batchArticleMatcher";

describe("normalizeSku", () => {
  it("lowercases and strips separators", () => {
    expect(normalizeSku("AATB-004")).toBe("aatb004");
    expect(normalizeSku(" AATB_004 ")).toBe("aatb004");
    expect(normalizeSku(null)).toBe("");
  });
});

describe("normalizeEan", () => {
  it("keeps digits and strips GTIN-14 leading zero", () => {
    expect(normalizeEan("04012345678901")).toBe("4012345678901");
    expect(normalizeEan("4012345678901")).toBe("4012345678901");
    expect(normalizeEan("  40-123 45678901  ")).toBe("4012345678901");
  });
});

describe("jaccardSimilarity", () => {
  it("computes token overlap", () => {
    const a = new Set(["hund", "leine", "rot"]);
    const b = new Set(["hund", "leine", "blau"]);
    expect(jaccardSimilarity(a, b)).toBeCloseTo(2 / 4, 2);
  });
  it("returns 0 for empty", () => {
    expect(jaccardSimilarity(new Set(), new Set(["x"]))).toBe(0);
  });
});

describe("tokenizeTitle", () => {
  it("filters stopwords and short tokens", () => {
    const tokens = tokenizeTitle("Der große Hund mit Leine");
    expect(tokens.has("hund")).toBe(true);
    expect(tokens.has("leine")).toBe(true);
    expect(tokens.has("der")).toBe(false);
    expect(tokens.has("mit")).toBe(false);
  });
});

describe("levenshtein", () => {
  it("measures edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("matchArticleToCandidate — SKU exact", () => {
  it("matches normalized SKU", () => {
    const article: XentralArticle = { sku: "AATB-004", title: "Test" };
    const candidate: MatchCandidate = { marketplaceSku: "aatb_004", title: "Test" };
    const r = matchArticleToCandidate(article, candidate);
    expect(r.matched).toBe(true);
    expect(r.matchType).toBe("sku_exact");
    expect(r.confidence).toBe(1.0);
  });
});

describe("matchArticleToCandidate — EAN exact", () => {
  it("matches via EAN despite different SKU", () => {
    const article: XentralArticle = { sku: "AATB-004", title: "Foo", ean: "4012345678901" };
    const candidate: MatchCandidate = { marketplaceSku: "AMZ-XYZ-999", title: "Bar", ean: "04012345678901" };
    const r = matchArticleToCandidate(article, candidate);
    expect(r.matched).toBe(true);
    expect(r.matchType).toBe("ean_exact");
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe("matchArticleToCandidate — partial SKU", () => {
  it("matches prefixed SKU variant", () => {
    const article: XentralArticle = { sku: "AATB-004", title: "Test" };
    const candidate: MatchCandidate = { marketplaceSku: "AMZ-AATB-004", title: "Test" };
    const r = matchArticleToCandidate(article, candidate);
    expect(r.matched).toBe(true);
    expect(["sku_partial", "sku_exact"]).toContain(r.matchType);
  });
});

describe("matchArticleToCandidate — title fuzzy", () => {
  it("matches by title when SKUs differ", () => {
    const article: XentralArticle = {
      sku: "ABC",
      title: "Premium Hundeleine robust Nylon schwarz 2m",
    };
    const candidate: MatchCandidate = {
      marketplaceSku: "XYZ",
      title: "Hundeleine Premium Nylon schwarz robust 2m",
    };
    const r = matchArticleToCandidate(article, candidate);
    expect(r.matched).toBe(true);
    expect(r.matchType).toBe("title_fuzzy");
  });

  it("does not match unrelated titles", () => {
    const article: XentralArticle = { sku: "A", title: "Katzenkratzbaum XL beige" };
    const candidate: MatchCandidate = { marketplaceSku: "B", title: "Hundefutter Lamm 5kg" };
    const r = matchArticleToCandidate(article, candidate);
    expect(r.matched).toBe(false);
  });
});

describe("matchArticleToMarketplace", () => {
  it("returns best of many candidates", () => {
    const article: XentralArticle = { sku: "AATB-004", title: "Hundeleine", ean: "4012345678901" };
    const candidates: MatchCandidate[] = [
      { marketplaceSku: "other", title: "Katzenkratzbaum" },
      { marketplaceSku: "AMZ-999", title: "Hundeleine", ean: "4012345678901" },
    ];
    const r = matchArticleToMarketplace(article, candidates);
    expect(r.matched).toBe(true);
    expect(r.candidate?.marketplaceSku).toBe("AMZ-999");
  });

  it("returns unmatched when no candidate fits", () => {
    const article: XentralArticle = { sku: "ABC", title: "Hundefutter" };
    const candidates: MatchCandidate[] = [{ marketplaceSku: "XYZ", title: "Katzenspielzeug" }];
    const r = matchArticleToMarketplace(article, candidates);
    expect(r.matched).toBe(false);
  });
});

describe("batchMatchArticles", () => {
  it("matches many articles efficiently", () => {
    const articles: XentralArticle[] = [
      { sku: "AATB-004", title: "Hundeleine rot" },
      { sku: "AATB-005", title: "Hundehalsband blau", ean: "4012345678902" },
      { sku: "AATB-999", title: "Unbekannt" },
    ];
    const candidates: MatchCandidate[] = [
      { marketplaceSku: "AATB-004", title: "Hundeleine" },
      { marketplaceSku: "AMZ-X", title: "something", ean: "04012345678902" },
    ];
    const results = batchMatchArticles(articles, candidates);
    expect(results).toHaveLength(3);
    expect(results[0].result.matchType).toBe("sku_exact");
    expect(results[1].result.matchType).toBe("ean_exact");
    expect(results[2].result.matched).toBe(false);
  });

  it("handles empty candidates gracefully", () => {
    const results = batchMatchArticles([{ sku: "A", title: "t" }], []);
    expect(results).toHaveLength(1);
    expect(results[0].result.matched).toBe(false);
  });
});
