import type { AmazonTitleOptimizationPayload } from "@/shared/lib/amazonTitleLlmReview";

/** Editor-Feld für Vorschlags-Chips (optional). */
export type AmazonContentAuditFindingField =
  | "title"
  | "description"
  | "bulletPoints"
  | "brand"
  | "productType"
  | "images"
  | "asin"
  | "externalProductId"
  | "packageDimensions"
  | "packageWeight"
  | "attributes";

export type AmazonContentAuditFinding = {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  recommendation?: string;
  /** Zuordnung zur Editor-Spalte für UI-Vorschläge. */
  field?: AmazonContentAuditFindingField;
};

export type AmazonContentAuditDiff = {
  field: string;
  amazonValue: string;
  referenceValue: string;
  note: string;
};

export type AmazonContentAuditRecommendations = {
  title: string;
  bulletPoints: string[];
  description: string;
  searchTerms: string;
};

export type AmazonContentAuditShopifyRef = { storefrontUrl: string; adminProductUrl: string } | null;

export type AmazonContentAuditPayload = {
  sku: string;
  findings: AmazonContentAuditFinding[];
  diffs: AmazonContentAuditDiff[];
  recommendations: AmazonContentAuditRecommendations;
  inferredKeywords: string[];
  shopify: AmazonContentAuditShopifyRef;
  /** EAN aus Xentral-Stamm (SKU-Treffer), für Editor-Vorschlag wenn Amazon leer. */
  xentralEan?: string | null;
  /** Für Titelprüfung am aktuellen Editor-Text (gleiche Logik wie Server). */
  rulebookMarkdown?: string;
  /** Snapshot der Listung zum Zeitpunkt der Prüfung (Abgleich Kanal-Diffs). */
  amazon?: { title: string; brand?: string };
  /** Regelwerk + Kontext-basierte Titelanalyse (OpenAI, optional). */
  titleOptimization?: AmazonTitleOptimizationPayload | null;
};

export type { AmazonTitleOptimizationPayload };
