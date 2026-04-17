/**
 * Claude-basierte Optimierung für Cross-Listing-Drafts.
 *
 * Nimmt die bereits regelbasiert gemergten Werte plus Roh-Quellen + Ziel-Marktplatz-Regelwerk
 * und gibt marktplatzgerecht optimierte Texte zurück (Titel, Beschreibung, Bullets, SearchTerms).
 *
 * Erfundet KEINE Fakten — LLM darf nur reformulieren, kürzen, Reihenfolge ändern.
 * Pattern adaptiert aus `amazonContentLlmClaude.ts`.
 */

import { z } from "zod";
import { readIntegrationSecret } from "@/shared/lib/integrationSecrets";
import type {
  CrossListingDraftValues,
  CrossListingSourceMap,
  CrossListingTargetSlug,
} from "./crossListingDraftTypes";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_TIMEOUT_MS = 90_000;
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ---------------------------------------------------------------------------
// Tool-Schema — Tool Use erzwingt strukturierten Output
// ---------------------------------------------------------------------------

type FieldLimits = {
  titleMax: number;
  descriptionMax: number;
  bulletMax: number;
  bulletsMaxItems: number;
  supportsBullets: boolean;
  supportsSearchTerms: boolean;
  searchTermsMaxBytes?: number;
};

function buildToolDefinition(limits: FieldLimits) {
  const optionalString = (maxLength: number) => ({
    type: "object",
    required: ["improved", "reason"],
    properties: {
      improved: { type: ["string", "null"], maxLength },
      reason: { type: "string", maxLength: 400 },
    },
  });
  const properties: Record<string, unknown> = {
    title: optionalString(limits.titleMax),
    description: optionalString(limits.descriptionMax),
  };
  if (limits.supportsBullets) {
    properties.bulletPoints = {
      type: "object",
      required: ["improved", "reason"],
      properties: {
        improved: {
          type: ["array", "null"],
          items: { type: "string", maxLength: limits.bulletMax },
          maxItems: limits.bulletsMaxItems,
        },
        reason: { type: "string", maxLength: 400 },
      },
    };
  }
  if (limits.supportsSearchTerms) {
    properties.searchTerms = optionalString(limits.searchTermsMaxBytes ?? 249);
  }
  return {
    name: "optimize_cross_listing",
    description:
      "Optimiert Titel, Beschreibung, Bulletpoints und Search-Terms eines Produkt-Listings für den Ziel-Marktplatz. Erfindet KEINE Fakten — reformuliert/kürzt/strukturiert nur vorhandene Informationen. Gibt pro Feld den verbesserten Wert (oder null bei keiner Änderung) und eine kurze Begründung zurück.",
    input_schema: {
      type: "object",
      required: ["fields", "summary", "noMaterialImprovement"],
      properties: {
        fields: {
          type: "object",
          properties,
        },
        summary: { type: "string", maxLength: 1500 },
        noMaterialImprovement: { type: "boolean" },
      },
    },
  } as const;
}

// ---------------------------------------------------------------------------
// Runtime-Zod-Schema
// ---------------------------------------------------------------------------

const FieldOptString = z.object({
  improved: z.union([z.string(), z.null()]),
  reason: z.string().default(""),
});
const FieldOptArray = z.object({
  improved: z.union([z.array(z.string()), z.null()]),
  reason: z.string().default(""),
});

const ToolInputZod = z.object({
  fields: z
    .object({
      title: FieldOptString.optional(),
      description: FieldOptString.optional(),
      bulletPoints: FieldOptArray.optional(),
      searchTerms: FieldOptString.optional(),
    })
    .default({}),
  summary: z.string().default(""),
  noMaterialImprovement: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Prompt-Bau
// ---------------------------------------------------------------------------

const MARKETPLACE_LABELS: Record<CrossListingTargetSlug, string> = {
  amazon: "Amazon.de",
  otto: "Otto.de",
  ebay: "eBay.de",
  kaufland: "Kaufland.de",
  fressnapf: "Fressnapf.de",
  "mediamarkt-saturn": "MediaMarkt & Saturn",
  zooplus: "Zooplus.de",
  tiktok: "TikTok Shop",
  shopify: "Shopify (astropet.de)",
};

/**
 * Mapping language_tag (z. B. "de_DE") → Anweisung an das LLM.
 * Amazon EU unterstützt mehrere Länder; für FR soll der Content auf Französisch sein.
 */
const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  de_DE: "Deutsch (DE), keine Fremdwörter außer Markennamen / Fachbegriffen.",
  fr_FR: "Französisch (FR), keine Fremdwörter außer Markennamen / Fachbegriffen.",
  fr_BE: "Französisch (BE), keine Fremdwörter außer Markennamen / Fachbegriffen.",
  it_IT: "Italienisch (IT), keine Fremdwörter außer Markennamen / Fachbegriffen.",
  es_ES: "Spanisch (ES), keine Fremdwörter außer Markennamen / Fachbegriffen.",
  nl_NL: "Niederländisch (NL), keine Fremdwörter außer Markennamen / Fachbegriffen.",
  pl_PL: "Polnisch (PL), keine Fremdwörter außer Markennamen / Fachbegriffen.",
  sv_SE: "Schwedisch (SE), keine Fremdwörter außer Markennamen / Fachbegriffen.",
  en_GB: "Englisch (GB), keine Fremdwörter außer Markennamen / Fachbegriffen.",
};

function buildSystemPrompt(
  target: CrossListingTargetSlug,
  rulebook: string,
  limits: FieldLimits,
  marketplaceLabelOverride?: string | null,
  languageTag?: string | null
): string {
  const label = marketplaceLabelOverride ?? MARKETPLACE_LABELS[target];
  const langKey = languageTag && LANGUAGE_INSTRUCTIONS[languageTag] ? languageTag : "de_DE";
  const langLine = LANGUAGE_INSTRUCTIONS[langKey];
  return `Du bist ein spezialisierter E-Commerce Content-Experte für den europäischen Markt, insbesondere für Haustierbedarf. Du erstellst optimierte Produktlistings für verschiedene Online-Marktplätze.

Deine Aufgabe: Optimiere ein bereits bestehendes Listing-Entwurf für ${label} basierend auf den vorhandenen Rohdaten von anderen Plattformen und den hinterlegten Marktplatz-Richtlinien.

REGELN FÜR ${label.toUpperCase()}:
${rulebook.trim()}

FELD-LIMITS:
- Titel: max. ${limits.titleMax} Zeichen
- Beschreibung: max. ${limits.descriptionMax} Zeichen
${limits.supportsBullets ? `- Bullets: max. ${limits.bulletsMaxItems} Einträge, je max. ${limits.bulletMax} Zeichen` : "- Bullets: NICHT unterstützt — weglassen"}
${limits.supportsSearchTerms ? `- SearchTerms: max. ${limits.searchTermsMaxBytes ?? 249} Bytes` : "- SearchTerms: NICHT unterstützt — weglassen"}

WICHTIGE PRINZIPIEN:
- Erfinde KEINE Produkteigenschaften — nutze nur was in den Rohdaten steht.
- Halte ALLE Zeichenlimits strikt ein.
- Passe Ton und Stil an den Charakter von ${label} an.
- Nutze die BESTEN Elemente aus allen Quell-Listings (auch wenn sie von anderen Plattformen stammen).
- Wenn ein Feld bereits optimal ist, gib null zurück (spart Traffic).
- ${langLine}
- Keine Emojis. Keine Sonderzeichen wie !, ?, €, ™ im Titel.`;
}

function sanitizeForPrompt(value: string, max = 1500): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function buildUserPayload(args: {
  sku: string;
  target: CrossListingTargetSlug;
  mergedValues: CrossListingDraftValues;
  sourceData: CrossListingSourceMap;
}): string {
  const { sku, mergedValues, sourceData } = args;
  const lines: string[] = [];
  lines.push(`SKU: ${sku}`);
  if (mergedValues.ean) lines.push(`EAN: ${mergedValues.ean}`);
  lines.push("");
  lines.push("=== AKTUELLER DRAFT (regelbasiert gemerged) ===");
  lines.push(`Titel: ${sanitizeForPrompt(mergedValues.title, 240) || "—"}`);
  lines.push(`Beschreibung: ${sanitizeForPrompt(mergedValues.description, 2500) || "—"}`);
  if (mergedValues.bullets.length > 0) {
    lines.push("Bullets:");
    mergedValues.bullets.forEach((b, i) => lines.push(`  ${i + 1}. ${sanitizeForPrompt(b, 520)}`));
  }
  lines.push("");
  lines.push("=== ROHDATEN VON QUELL-PLATTFORMEN ===");
  const entries = Object.entries(sourceData);
  let hasSources = false;
  for (const [slug, rec] of entries) {
    if (!rec) continue;
    hasSources = true;
    lines.push(`--- ${slug} ---`);
    if (rec.title) lines.push(`Titel: ${sanitizeForPrompt(rec.title, 240)}`);
    if (rec.description) lines.push(`Beschreibung: ${sanitizeForPrompt(rec.description, 2500)}`);
    if (rec.bullets.length > 0) {
      lines.push("Bullets:");
      rec.bullets.slice(0, 8).forEach((b, i) => lines.push(`  ${i + 1}. ${sanitizeForPrompt(b, 520)}`));
    }
    const attrs = Object.entries(rec.attributes).slice(0, 20);
    if (attrs.length > 0) {
      lines.push(`Attribute: ${attrs.map(([k, v]) => `${k}=${v}`).join(", ")}`);
    }
  }
  if (!hasSources) lines.push("(keine weiteren Quell-Plattformen mit Daten zu dieser SKU)");
  lines.push("");
  lines.push(
    "Optimiere den Draft für den Ziel-Marktplatz. Gib für jedes Feld entweder einen verbesserten Wert oder null zurück, plus eine kurze Begründung."
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Ergebnis-Typ + Öffentliche Funktion
// ---------------------------------------------------------------------------

export type CrossListingLlmResult = {
  usedLlm: boolean;
  model: string | null;
  provider: "claude";
  improvedTitle: string | null;
  improvedDescription: string | null;
  improvedBullets: string[] | null;
  improvedSearchTerms: string | null;
  titleReason: string;
  descriptionReason: string;
  bulletsReason: string;
  searchTermsReason: string;
  summary: string;
  noMaterialImprovement: boolean;
  llmSkippedReason?: string;
  llmError?: string;
};

function emptyResult(reason: string, partial?: Partial<CrossListingLlmResult>): CrossListingLlmResult {
  return {
    usedLlm: false,
    model: null,
    provider: "claude",
    improvedTitle: null,
    improvedDescription: null,
    improvedBullets: null,
    improvedSearchTerms: null,
    titleReason: "",
    descriptionReason: "",
    bulletsReason: "",
    searchTermsReason: "",
    summary: partial?.summary ?? "",
    noMaterialImprovement: true,
    llmSkippedReason: reason,
    ...partial,
  };
}

function normOrNull(v: string | null | undefined, max: number): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max).trim() : t;
}

export async function runCrossListingClaudeOptimize(args: {
  sku: string;
  target: CrossListingTargetSlug;
  rulebookMarkdown: string;
  mergedValues: CrossListingDraftValues;
  sourceData: CrossListingSourceMap;
  limits: FieldLimits;
  /** Amazon-Multi-Country: bestimmt die Zielsprache + den Label-Override. */
  amazonCountryLabel?: string;
  languageTag?: string;
}): Promise<CrossListingLlmResult> {
  const { value: apiKey } = await readIntegrationSecret("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return emptyResult("no_api_key", {
      summary: "Kein ANTHROPIC_API_KEY gesetzt. LLM-Optimierung deaktiviert.",
    });
  }

  const model = (process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const system = buildSystemPrompt(
    args.target,
    args.rulebookMarkdown,
    args.limits,
    args.amazonCountryLabel ?? null,
    args.languageTag ?? null
  );
  const userPayload = buildUserPayload({
    sku: args.sku,
    target: args.target,
    mergedValues: args.mergedValues,
    sourceData: args.sourceData,
  });
  const tool = buildToolDefinition(args.limits);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: "optimize_cross_listing" },
        messages: [{ role: "user", content: userPayload }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return emptyResult("http_error", {
        llmError: `Anthropic HTTP ${res.status}: ${errText.slice(0, 240)}`,
        summary: "Claude-Anfrage fehlgeschlagen.",
      });
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; name?: string; input?: unknown }>;
    };

    const toolBlock = data.content?.find(
      (b) => b.type === "tool_use" && b.name === "optimize_cross_listing"
    );
    if (!toolBlock || !toolBlock.input) {
      return emptyResult("empty_response", {
        llmError: "Claude lieferte keinen tool_use-Block.",
        summary: "Claude-Antwort enthielt keine strukturierten Daten.",
      });
    }

    const parsed = ToolInputZod.safeParse(toolBlock.input);
    if (!parsed.success) {
      return emptyResult("parse_error", {
        llmError: parsed.error.message,
        summary: "Claude-Antwort entsprach nicht dem erwarteten Schema.",
      });
    }

    const v = parsed.data;
    const improvedTitle = normOrNull(v.fields.title?.improved ?? null, args.limits.titleMax);
    const improvedDescription = normOrNull(
      v.fields.description?.improved ?? null,
      args.limits.descriptionMax
    );
    const improvedBullets = args.limits.supportsBullets
      ? (v.fields.bulletPoints?.improved ?? null)?.map((s) => s.trim()).filter((s) => s.length > 0) ??
        null
      : null;
    const improvedSearchTerms = args.limits.supportsSearchTerms
      ? normOrNull(v.fields.searchTerms?.improved ?? null, args.limits.searchTermsMaxBytes ?? 249)
      : null;

    // Suppress unchanged returns
    const titleChanged = improvedTitle && improvedTitle !== args.mergedValues.title.trim();
    const descChanged = improvedDescription && improvedDescription !== args.mergedValues.description.trim();
    const bulletsChanged =
      improvedBullets &&
      improvedBullets.join("\n") !== args.mergedValues.bullets.join("\n");

    const any = Boolean(titleChanged || descChanged || bulletsChanged || improvedSearchTerms);

    return {
      usedLlm: true,
      model,
      provider: "claude",
      improvedTitle: titleChanged ? improvedTitle : null,
      improvedDescription: descChanged ? improvedDescription : null,
      improvedBullets: bulletsChanged && improvedBullets ? improvedBullets : null,
      improvedSearchTerms,
      titleReason: v.fields.title?.reason ?? "",
      descriptionReason: v.fields.description?.reason ?? "",
      bulletsReason: v.fields.bulletPoints?.reason ?? "",
      searchTermsReason: v.fields.searchTerms?.reason ?? "",
      summary: v.summary.trim(),
      noMaterialImprovement: any ? false : Boolean(v.noMaterialImprovement),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort") || msg.includes("Abort")) {
      return emptyResult("timeout", {
        llmError: "Zeitüberschreitung Claude.",
        summary: "Claude-Anfrage dauerte zu lange.",
      });
    }
    return emptyResult("exception", {
      llmError: msg,
      summary: "Claude-Aufruf fehlgeschlagen.",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Hilfsfunktion: Limits aus Feld-Config extrahieren
// ---------------------------------------------------------------------------

import type { CrossListingFieldConfig } from "./crossListingDraftTypes";

export function limitsFromConfig(config: CrossListingFieldConfig): FieldLimits {
  const byKey = new Map(config.fields.map((f) => [f.key, f]));
  const title = byKey.get("title");
  const description = byKey.get("description");
  const bullets = byKey.get("bullets");
  return {
    titleMax: title?.maxLength ?? 200,
    descriptionMax: description?.maxLength ?? 2000,
    bulletMax: bullets?.maxLength ?? 500,
    bulletsMaxItems: bullets?.maxItems ?? 5,
    supportsBullets: Boolean(bullets),
    supportsSearchTerms: config.slug === "amazon",
    searchTermsMaxBytes: config.slug === "amazon" ? 249 : undefined,
  };
}
