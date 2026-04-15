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
/** Regelwerk empfiehlt 80, Amazon erlaubt 200 — wir warnen ab 80. */
const TITLE_RECOMMENDED_LEN = 80;
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
  "aktion",
  "neuheit",
  "top",
  "exklusiv",
  "limitiert",
  "gratisversand",
  "schnellversand",
  "billig",
  "günstig",
];
const TITLE_BANNED_SYMBOLS = /[!?*€®©™""]/;
const TITLE_HTML_TAGS = /<\/?[a-z][^>]*>/i;

/** Verbotene Inhalte in Bullet Points */
const BULLET_BANNED = [
  "sonderangebot",
  "versandkostenfrei",
  "gratisversand",
  "attraktiver preis",
  "preis-leistungs-sieger",
  "lieferung ab lager",
];
const BULLET_VAGUE = [
  "original verpackte neuware",
  "hochwertige aufmachung",
  "premium qualität",
];

/** Verbotene Inhalte in Beschreibung */
const DESC_BANNED = [
  "sonderangebot",
  "versandkostenfrei",
  "sale",
  "rabatt",
  "gratis",
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

  if (hasRulebookHint(rb, "TITEL-001") && amazonTitle.length > TITLE_RECOMMENDED_LEN) {
    findings.push({
      id: "rule-title-001",
      severity: amazonTitle.length > TITLE_MAX_LEN ? "high" : "medium",
      message: `Regelwerk TITEL-001: Titel hat ${amazonTitle.length} Zeichen (empfohlen max. ${TITLE_RECOMMENDED_LEN}).`,
      recommendation: "Titel kürzen — auf mobilen Geräten werden nur ca. 80 Zeichen vollständig angezeigt.",
      field: "title",
    });
  }

  // TITEL-002: Nur Großbuchstaben oder nur Kleinbuchstaben
  const letters = amazonTitle.replace(/[^a-zA-ZäöüÄÖÜß]/g, "");
  if (letters.length >= 10 && (letters === letters.toUpperCase() || letters === letters.toLowerCase())) {
    findings.push({
      id: "title-case-violation",
      severity: "high",
      message: "Titel in nur Großbuchstaben oder nur Kleinbuchstaben — korrekte Groß-/Kleinschreibung verwenden.",
      recommendation: "Deutschen Regeln für Groß-/Kleinschreibung folgen (TITEL-002).",
      field: "title",
    });
  }

  // TITEL-005: Preisangaben im Titel
  if (/\d+[\s,.]?\d*\s*€|EUR\s*\d|preis/i.test(amazonTitle)) {
    findings.push({
      id: "title-price",
      severity: "high",
      message: "Titel enthält Preisangabe — verboten laut TITEL-005.",
      recommendation: "Preisangaben aus dem Titel entfernen.",
      field: "title",
    });
  }

  // TITEL-006: Verbotene Symbole
  if (TITLE_BANNED_SYMBOLS.test(amazonTitle)) {
    findings.push({
      id: "title-banned-symbols",
      severity: "high",
      message: "Titel enthält verbotene Symbole (!, ?, *, €, ®, ©, ™ o.ä.) — TITEL-006.",
      recommendation: "Verbotene Sonderzeichen aus dem Titel entfernen.",
      field: "title",
    });
  }

  // TITEL-009: HTML-Tags im Titel
  if (TITLE_HTML_TAGS.test(amazonTitle)) {
    findings.push({
      id: "title-html-tags",
      severity: "high",
      message: "Titel enthält HTML-Tags — TITEL-009.",
      recommendation: "HTML-Tags aus dem Titel entfernen, sie werden nicht gerendert.",
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
      message: `Nur ${amazonBullets.length} Bullet Points vorhanden (ATTR-001 empfiehlt 5).`,
      recommendation: "5 klare, nutzenorientierte Bullet Points ergänzen (orientieren am Regelwerk).",
      field: "bulletPoints",
    });
  }
  if (amazonBullets.length > 5) {
    findings.push({
      id: "bullets-too-many",
      severity: "medium",
      message: `${amazonBullets.length} Bullet Points — Amazon zeigt maximal 5 an (ATTR-001).`,
      recommendation: "Auf die 5 wichtigsten Bullet Points kürzen.",
      field: "bulletPoints",
    });
  }

  // ATTR-002: Jedes Highlight mit Großbuchstaben beginnen
  for (let i = 0; i < amazonBullets.length; i++) {
    const b = amazonBullets[i];
    if (b.length > 0 && b[0] !== b[0].toUpperCase()) {
      findings.push({
        id: `bullet-lowercase-start-${i}`,
        severity: "low",
        message: `Bullet Point ${i + 1} beginnt mit Kleinbuchstaben (ATTR-002).`,
        recommendation: "Jeden Bullet Point mit einem Großbuchstaben beginnen.",
        field: "bulletPoints",
      });
      break;
    }
  }

  // ATTR-008/009: Verbotene Inhalte in Bullets
  for (const bullet of amazonBullets) {
    const lc = bullet.toLowerCase();
    for (const banned of BULLET_BANNED) {
      if (lc.includes(banned)) {
        findings.push({
          id: `bullet-banned-${banned.replace(/\s/g, "_")}`,
          severity: "high",
          message: `Bullet Point enthält verbotenen Begriff: "${banned}" (ATTR-008/009).`,
          recommendation: "Preis-, Werbe- oder Versandhinweise aus Bullet Points entfernen.",
          field: "bulletPoints",
        });
        break;
      }
    }
    for (const vague of BULLET_VAGUE) {
      if (lc.includes(vague)) {
        findings.push({
          id: `bullet-vague-${vague.replace(/\s/g, "_")}`,
          severity: "low",
          message: `Bullet Point enthält vage Aussage: "${vague}" (ATTR-007).`,
          recommendation: "Durch konkrete, beschreibende Produktmerkmale ersetzen.",
          field: "bulletPoints",
        });
        break;
      }
    }
  }

  // Beschreibung
  if (!amazonDesc) {
    findings.push({
      id: "description-missing",
      severity: "high",
      message: "Produktbeschreibung fehlt (BESCH-001).",
      recommendation: "Produktbeschreibung als Fließtext ergänzen — Nutzen, Anwendung, Alleinstellungsmerkmale.",
      field: "description",
    });
  } else if (amazonDesc.length < 120) {
    findings.push({
      id: "description-short",
      severity: "medium",
      message: `Produktbeschreibung ist sehr kurz (${amazonDesc.length} Zeichen).`,
      recommendation: "Anwendungsfall, Material, Nutzen und Größenangaben ergänzen (mind. 150 Zeichen empfohlen).",
      field: "description",
    });
  }

  // BESCH-004: Verbotene Inhalte in Beschreibung
  if (amazonDesc) {
    const descLc = amazonDesc.toLowerCase();
    for (const banned of DESC_BANNED) {
      if (descLc.includes(banned)) {
        findings.push({
          id: `description-banned-${banned}`,
          severity: "high",
          message: `Beschreibung enthält verbotenen Begriff: "${banned}" (BESCH-004).`,
          recommendation: "Preis-/Werbe-/Versandhinweise aus der Beschreibung entfernen.",
          field: "description",
        });
        break;
      }
    }
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

  if (hasRulebookHint(input.rulebookMarkdown, "BESCH-001") && !amazonDesc) {
    findings.push({
      id: "rule-description-001",
      severity: "high",
      message: "Regelwerk BESCH-001: Beschreibungsfeld darf nicht leer bleiben.",
      field: "description",
    });
  }

  // MARKE-001: Jedes Produkt muss eine Marke hinterlegt haben
  if (!amazonBrand) {
    findings.push({
      id: "brand-missing",
      severity: "high",
      message: "Keine Marke hinterlegt (MARKE-001) — Produkt über Markenfilter nicht auffindbar.",
      recommendation: "Marke im Editor ergänzen.",
      field: "brand",
    });
  }

  // EAN-Check: ALLG-001
  if (!cleanText(input.amazon.externalProductId)) {
    findings.push({
      id: "ean-missing",
      severity: "high",
      message: "Keine EAN / GTIN hinterlegt (ALLG-001) — Produkt kann ggf. nicht gelistet werden.",
      recommendation: "EAN aus Xentral oder Lieferant übernehmen.",
      field: "externalProductId",
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
