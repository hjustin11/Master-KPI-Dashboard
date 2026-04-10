import { sanitizeAmazonBulletPoints, sanitizeAmazonDescription } from "@/shared/lib/amazonProductDraft";
import { getMissingAmazonRequiredFields } from "@/shared/lib/amazonProductTypeSchema";

export type AmazonAuditSeverity = "critical" | "high" | "medium" | "low" | "info";

export type AmazonAuditFindingField =
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

export type AmazonAuditFinding = {
  id: string;
  severity: AmazonAuditSeverity;
  message: string;
  recommendation?: string;
  field?: AmazonAuditFindingField;
};

export type AmazonAuditComparisonDiff = {
  field: "title" | "description" | "brand" | "productType" | "images";
  amazonValue: string;
  referenceValue: string;
  note: string;
};

export type AmazonCopyPasteRecommendation = {
  title: string;
  bulletPoints: string[];
  description: string;
  searchTerms: string;
};

export type AmazonAuditInput = {
  sku: string;
  rulebookMarkdown: string;
  amazon: {
    title: string;
    description: string;
    bulletPoints: string[];
    brand: string;
    productType: string;
    images: string[];
    asin: string;
    externalProductId: string;
    packageLength: string;
    packageWidth: string;
    packageHeight: string;
    packageWeight: string;
    /** Serialisierte Zusatzattribute (Key: Wert pro Zeile o. ä.) für Plausibilität. */
    attributes: Record<string, string>;
    conditionType: string;
    externalProductIdType: "ean" | "upc" | "gtin" | "isbn" | "none";
    listPriceEur: string;
    quantity: string;
  };
  shopify: {
    title: string;
    description: string;
    tags: string[];
    images: string[];
    storefrontUrl: string;
    adminProductUrl: string;
    productType: string;
    vendor: string;
  } | null;
  otherMarketplaceHints: Array<{
    marketplace: string;
    title: string;
    descriptionExcerpt: string;
    brand: string;
    productType: string;
  }>;
};

export type AmazonAuditOutput = {
  findings: AmazonAuditFinding[];
  diffs: AmazonAuditComparisonDiff[];
  recommendations: AmazonCopyPasteRecommendation;
  inferredKeywords: string[];
};

const TITLE_MAX_LEN = 200;
/** Unterhalb davon wirkt der Titel für Amazon oft zu knapp (Kernmerkmale). */
const TITLE_MIN_LEN = 30;
const TITLE_BANNED = [
  "sonderangebot",
  "bestseller",
  "sale",
  "rabatt",
  "versandkostenfrei",
  "gratis",
  "kostenlos",
  "prime",
];

/** Mindestlänge für einen Beschreibungs-Abgleich (weniger = oft Rauschen). */
const MIN_DESC_EXCERPT_FOR_DIFF = 40;

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function toLinesFromText(value: string, max = 5): string[] {
  const parts = value
    .split(/[.;•\n\r]+/)
    .map((x) => cleanText(x))
    .filter((x) => x.length >= 6);
  const out: string[] = [];
  for (const part of parts) {
    if (!out.includes(part)) out.push(part);
    if (out.length >= max) break;
  }
  return out;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s-]/gi, " ")
    .split(/[\s-]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const STOPWORDS = new Set([
  "und",
  "oder",
  "mit",
  "für",
  "der",
  "die",
  "das",
  "ein",
  "eine",
  "des",
  "den",
  "dem",
  "in",
  "im",
  "am",
  "zu",
  "von",
  "the",
  "and",
  "for",
  "mit",
  "bei",
]);

/**
 * Suchbegriffe: Begriffe, die in Kanal-Content vorkommen, aber noch nicht im Amazon-Text —
 * rein optional, wenn externe Quellen existieren; sonst leer.
 */
function buildKeywordSuggestions(input: AmazonAuditInput): string[] {
  const source = [
    input.shopify?.title ?? "",
    input.shopify?.description ?? "",
    ...(input.shopify?.tags ?? []),
    ...input.otherMarketplaceHints.map((h) => h.title),
    ...input.otherMarketplaceHints.map((h) => h.descriptionExcerpt),
  ].join(" ");
  const amazonText = [input.amazon.title, input.amazon.description, ...input.amazon.bulletPoints].join(" ");
  const have = new Set(tokens(amazonText));
  const score = new Map<string, number>();
  for (const token of tokens(source)) {
    if (token.length < 3) continue;
    if (STOPWORDS.has(token)) continue;
    if (have.has(token)) continue;
    score.set(token, (score.get(token) ?? 0) + 1);
  }
  return Array.from(score.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([token]) => token);
}

function hasRulebookHint(rulebook: string, phrase: string): boolean {
  return rulebook.toLowerCase().includes(phrase.toLowerCase());
}

function clampTitle(title: string): string {
  const t = cleanText(title);
  if (t.length <= TITLE_MAX_LEN) return t;
  return t.slice(0, TITLE_MAX_LEN).trim();
}

/** Entfernt typische unzulässige Titel-Begriffe (Wortgrenzen); für Vorschlagstext in der UI. */
export function proposeTitleWithoutBannedWords(title: string): string {
  let t = cleanText(title);
  for (const banned of TITLE_BANNED) {
    const escaped = banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    t = t.replace(re, " ");
  }
  return t.replace(/\s+/g, " ").trim();
}

/** Öffentlich für Editor: konsolidierter Listungstitel (gesperrte Wörter entfernt, max. Länge). */
export function buildAmazonTitleRecommendation(rawTitle: string): string {
  const cleaned = proposeTitleWithoutBannedWords(rawTitle);
  const clamped = clampTitle(cleaned);
  if (clamped) return clamped;
  return clampTitle(cleanText(rawTitle));
}

export type AmazonTitleAuditContext = {
  title: string;
  brand: string;
  rulebookMarkdown: string;
};

/**
 * Alle strukturellen / regelwerksbezogenen Titelprüfungen (einheitlich Server + Editor).
 */
export function getTitleAuditFindings(ctx: AmazonTitleAuditContext): AmazonAuditFinding[] {
  const findings: AmazonAuditFinding[] = [];
  const amazonTitle = cleanText(ctx.title);
  const brand = cleanText(ctx.brand);
  const rb = ctx.rulebookMarkdown;

  if (!amazonTitle) {
    findings.push({
      id: "title-missing",
      severity: "critical",
      message: "Amazon-Titel fehlt.",
      recommendation:
        "Titel gemäß internem Amazon-Regelwerk formulieren: Kernmerkmale und Spezifikation, keine werblichen oder irreführenden Begriffe.",
      field: "title",
    });
    return findings;
  }

  if (amazonTitle.length > TITLE_MAX_LEN) {
    findings.push({
      id: "title-too-long",
      severity: "high",
      message: `Amazon-Titel ist zu lang (${amazonTitle.length}/${TITLE_MAX_LEN}).`,
      recommendation: "Titel auf 200 Zeichen kürzen, Kernmerkmale vorne platzieren.",
      field: "title",
    });
  }

  if (amazonTitle.length < TITLE_MIN_LEN) {
    findings.push({
      id: "title-too-short",
      severity: "medium",
      message: `Produkttitel ist sehr kurz (${amazonTitle.length} Zeichen).`,
      recommendation:
        "Kernmerkmale, Variante und Spezifikation ergänzen (typisch mindestens ca. 30–80 Zeichen, je nach Regelwerk).",
      field: "title",
    });
  }

  for (const banned of TITLE_BANNED) {
    if (amazonTitle.toLowerCase().includes(banned)) {
      findings.push({
        id: `title-banned-${banned}`,
        severity: "high",
        message: `Titel enthält potenziell unzulässigen Begriff: "${banned}".`,
        recommendation: "Werbliche/versandbezogene Begriffe aus dem Titel entfernen.",
        field: "title",
      });
    }
  }

  if (brand.length >= 2 && !amazonTitle.toLowerCase().includes(brand.toLowerCase())) {
    findings.push({
      id: "title-brand-absent",
      severity: "info",
      message: "Die eingetragene Marke kommt im Titel nicht vor.",
      recommendation: "Prüfen, ob die Marke laut Regelwerk im Titel genannt werden soll.",
      field: "title",
    });
  }

  if (hasRulebookHint(rb, "TITEL-001") && amazonTitle.length > TITLE_MAX_LEN) {
    findings.push({
      id: "rule-title-001",
      severity: "high",
      message: "Regelwerk-Check: Titellänge verletzt.",
      field: "title",
    });
  }

  return findings;
}

function requiredIssueToField(key: string): AmazonAuditFindingField | undefined {
  if (key === "productType") return "productType";
  if (key === "brand") return "brand";
  if (key === "description") return "description";
  if (key === "bulletPoints") return "bulletPoints";
  if (key === "externalProductId") return "externalProductId";
  if (key.startsWith("attribute:")) return "attributes";
  return undefined;
}

function pushPackagePlausibilityFindings(
  findings: AmazonAuditFinding[],
  amazon: AmazonAuditInput["amazon"]
): void {
  const pl = cleanText(amazon.packageLength);
  const pw = cleanText(amazon.packageWidth);
  const ph = cleanText(amazon.packageHeight);
  const pwgt = cleanText(amazon.packageWeight);
  const anyDim = Boolean(pl || pw || ph);
  const anyPkg = anyDim || Boolean(pwgt);
  if (!anyPkg) return;
  if (anyDim && (!pl || !pw || !ph)) {
    findings.push({
      id: "package-dims-incomplete",
      severity: "medium",
      message: "Paketmaße: Länge, Breite und Höhe sollten gemeinsam gepflegt sein.",
      recommendation: "Alle drei Maße in derselben Einheit ergänzen.",
      field: "packageDimensions",
    });
  }
  if (anyPkg && !pwgt) {
    findings.push({
      id: "package-weight-missing",
      severity: "medium",
      message: "Paketgewicht fehlt, obwohl Versandmaße angegeben sind.",
      recommendation: "Gewicht ergänzen (Versand/Versandvorlage).",
      field: "packageWeight",
    });
  }
}

/** Optionaler Abgleich mit einem Kanal (Shopify / anderer MP) — ersetzt nicht das Regelwerk. */
function pushOptionalChannelDiffs(
  diffs: AmazonAuditComparisonDiff[],
  channelLabel: string,
  amazonTitle: string,
  amazonDesc: string,
  amazonBrand: string,
  refTitle: string,
  refDesc: string,
  refBrand: string
): void {
  const rt = cleanText(refTitle);
  const rd = cleanText(refDesc);
  const rb = cleanText(refBrand);

  if (amazonTitle && rt && amazonTitle !== rt) {
    diffs.push({
      field: "title",
      amazonValue: amazonTitle,
      referenceValue: rt,
      note: `${channelLabel}: Titel weicht ab (optionaler Kanalabgleich, nicht verbindlich wie das Regelwerk).`,
    });
  }
  if (amazonDesc && rd.length >= MIN_DESC_EXCERPT_FOR_DIFF && amazonDesc !== rd) {
    diffs.push({
      field: "description",
      amazonValue: amazonDesc.slice(0, 240),
      referenceValue: rd.slice(0, 240),
      note: `${channelLabel}: Beschreibung weicht ab (optionaler Kanalabgleich).`,
    });
  }
  if (amazonBrand && rb && amazonBrand !== rb) {
    diffs.push({
      field: "brand",
      amazonValue: amazonBrand,
      referenceValue: rb,
      note: `${channelLabel}: Marke/Hersteller weicht ab (optionaler Kanalabgleich).`,
    });
  }
}

/**
 * Empfohlene Bullets: zuerst Amazon (Listen oder aus Amazon-Beschreibung), erst danach optional externe Texte.
 */
function buildRecommendedBullets(input: AmazonAuditInput, amazonBullets: string[], amazonDesc: string): string[] {
  const fromList = sanitizeAmazonBulletPoints(amazonBullets).slice(0, 5);
  if (fromList.length >= 3) return fromList;

  const fromAmazonDesc = sanitizeAmazonBulletPoints(toLinesFromText(amazonDesc, 5)).slice(0, 5);
  if (fromAmazonDesc.length >= 3) return fromAmazonDesc;

  const fromShopifyDesc = sanitizeAmazonBulletPoints(toLinesFromText(input.shopify?.description ?? "", 5));
  if (fromShopifyDesc.length >= 3) return fromShopifyDesc.slice(0, 5);

  for (const h of input.otherMarketplaceHints) {
    const fromHint = sanitizeAmazonBulletPoints(toLinesFromText(h.descriptionExcerpt ?? "", 5));
    if (fromHint.length >= 3) return fromHint.slice(0, 5);
  }

  if (fromList.length > 0) return fromList;
  if (fromAmazonDesc.length > 0) return fromAmazonDesc;
  return fromShopifyDesc.slice(0, 5);
}

export function runAmazonContentAudit(input: AmazonAuditInput): AmazonAuditOutput {
  const findings: AmazonAuditFinding[] = [];
  const diffs: AmazonAuditComparisonDiff[] = [];

  const amazonTitle = cleanText(input.amazon.title);
  const amazonDesc = sanitizeAmazonDescription(input.amazon.description);
  const amazonBullets = sanitizeAmazonBulletPoints(input.amazon.bulletPoints).slice(0, 5);
  const amazonBrand = cleanText(input.amazon.brand);

  findings.push(
    ...getTitleAuditFindings({
      title: input.amazon.title,
      brand: input.amazon.brand,
      rulebookMarkdown: input.rulebookMarkdown,
    })
  );

  if (amazonBullets.length < 3) {
    findings.push({
      id: "bullets-too-few",
      severity: "medium",
      message: `Nur ${amazonBullets.length} Bullet Points vorhanden.`,
      recommendation: "3–5 klare, nutzenorientierte Bullet Points ergänzen (orientieren am Regelwerk).",
      field: "bulletPoints",
    });
  }
  if (amazonDesc.length > 0 && amazonDesc.length < 120) {
    findings.push({
      id: "description-short",
      severity: "medium",
      message: "Produktbeschreibung ist sehr kurz.",
      recommendation: "Anwendungsfall, Material, Nutzen und Größenangaben ergänzen.",
      field: "description",
    });
  }
  if (!input.amazon.images?.length) {
    findings.push({
      id: "images-missing",
      severity: "high",
      message: "Keine Bild-URLs im Amazon-Datensatz gefunden.",
      recommendation: "Main + mehrere Detailbilder hinterlegen.",
      field: "images",
    });
  }

  const asin = cleanText(input.amazon.asin);
  if (!asin) {
    findings.push({
      id: "asin-missing",
      severity: "info",
      message: "Keine ASIN im Datensatz.",
      recommendation: "ASIN ergänzen, sobald die Listung verknüpft ist.",
      field: "asin",
    });
  }

  pushPackagePlausibilityFindings(findings, input.amazon);

  const draftLike = {
    sku: input.sku,
    title: input.amazon.title,
    productType: input.amazon.productType,
    brand: input.amazon.brand,
    conditionType: input.amazon.conditionType,
    externalProductId: input.amazon.externalProductId,
    externalProductIdType: input.amazon.externalProductIdType,
    listPriceEur: input.amazon.listPriceEur,
    quantity: input.amazon.quantity,
    description: input.amazon.description,
    bulletPoints: input.amazon.bulletPoints,
    attributes: input.amazon.attributes,
  };
  const hasBulletsTooFewFinding = findings.some((f) => f.id === "bullets-too-few");
  for (const issue of getMissingAmazonRequiredFields(draftLike)) {
    if (issue.key === "title" && !amazonTitle) continue;
    if (issue.key === "title") continue;
    if (issue.key === "bulletPoints" && hasBulletsTooFewFinding) continue;
    const field = requiredIssueToField(issue.key);
    findings.push({
      id: `required-${issue.key.replace(/[^a-z0-9:_-]/gi, "_")}`,
      severity: "medium",
      message: `Pflichtfeld fehlt oder unvollständig: ${issue.label}.`,
      recommendation: "Feld im Editor ergänzen (siehe Regelwerk / Listungsanforderungen).",
      field,
    });
  }

  if (input.shopify) {
    pushOptionalChannelDiffs(
      diffs,
      "Shopify",
      amazonTitle,
      amazonDesc,
      amazonBrand,
      input.shopify.title,
      input.shopify.description,
      input.shopify.vendor
    );
  }

  for (const h of input.otherMarketplaceHints) {
    pushOptionalChannelDiffs(
      diffs,
      h.marketplace || "Marktplatz",
      amazonTitle,
      amazonDesc,
      amazonBrand,
      h.title,
      h.descriptionExcerpt,
      h.brand
    );
  }

  if (hasRulebookHint(input.rulebookMarkdown, "BESCHREIBUNG-001") && amazonDesc.length < 200) {
    findings.push({
      id: "rule-description-001",
      severity: "medium",
      message: "Regelwerk-Check: Beschreibung unter dokumentierter Mindestlänge.",
      field: "description",
    });
  }

  const inferredKeywords = buildKeywordSuggestions(input);
  const recommendedBullets = buildRecommendedBullets(input, input.amazon.bulletPoints, amazonDesc);

  const recommendations: AmazonCopyPasteRecommendation = {
    title: buildAmazonTitleRecommendation(amazonTitle),
    bulletPoints: recommendedBullets,
    description: amazonDesc,
    searchTerms: inferredKeywords.join(" ").slice(0, 249),
  };

  return { findings, diffs, recommendations, inferredKeywords };
}
