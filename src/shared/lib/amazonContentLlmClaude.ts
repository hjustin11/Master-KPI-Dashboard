/**
 * Claude-Provider für Amazon Content-Optimierung.
 * Nutzt die Anthropic Messages API + Tool Use für garantiert schema-konforme Outputs.
 *
 * Vorteile gegenüber OpenAI-Variante:
 * - Keine JSON-Parse-Fehler (Tool Use erzwingt valide Struktur)
 * - Per-Feld-Scores und Begründungen
 * - Regelwerk-ID-Referenzen in Issues
 * - Besseres Domain-Reasoning dank Claude Sonnet 4.5
 */

import { z } from "zod";
import { readIntegrationSecret } from "@/shared/lib/integrationSecrets";
import type { AmazonTitleProductContext } from "@/shared/lib/amazonTitleOptimizationContext";
import type {
  AmazonTitleOptimizationPayload,
  AmazonContentLlmIssue,
  AmazonOptimizedFields,
  AmazonFieldOptimization,
} from "@/shared/lib/amazonTitleLlmReview";
import {
  buildAmazonContentSystemPrompt,
  buildAmazonContentUserPayload,
} from "@/shared/lib/amazonContentPromptBuilder";

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_TIMEOUT_MS = 90_000;
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ---------------------------------------------------------------------------
// Tool-Schema — erzwingt strukturierten Output
// ---------------------------------------------------------------------------

/**
 * Wiederverwendbares Feld-Schema für Claude Tool Use.
 * `improved` akzeptiert string | string[] | null für Felder wie bulletPoints.
 */
const fieldSchema = (options: {
  improvedType: "string" | "array";
  maxLength?: number;
  maxItems?: number;
}) => {
  const improvedSchema =
    options.improvedType === "array"
      ? {
          type: ["array", "null"],
          items: {
            type: "string",
            ...(options.maxLength ? { maxLength: options.maxLength } : {}),
          },
          ...(options.maxItems ? { maxItems: options.maxItems } : {}),
        }
      : {
          type: ["string", "null"],
          ...(options.maxLength ? { maxLength: options.maxLength } : {}),
        };
  return {
    type: "object",
    required: ["score", "improved", "reason"],
    properties: {
      score: { type: "number", minimum: 0, maximum: 100 },
      improved: improvedSchema,
      reason: { type: "string", maxLength: 500 },
      ruleIds: {
        type: "array",
        items: { type: "string", maxLength: 40 },
        maxItems: 10,
      },
    },
  };
};

const TOOL_DEFINITION = {
  name: "optimize_amazon_listing",
  description:
    "Bewertet und optimiert ein Amazon.de Listing im Haustierbedarf-Bereich. Gibt pro Feld einen Score, einen Verbesserungsvorschlag (oder null wenn OK) und eine Begründung zurück. Referenziert wo möglich Regel-IDs aus dem hinterlegten Regelwerk.",
  input_schema: {
    type: "object",
    required: ["overallScore", "fields", "summary", "issues", "noMaterialImprovement"],
    properties: {
      overallScore: { type: "number", minimum: 0, maximum: 100 },
      fields: {
        type: "object",
        properties: {
          title: fieldSchema({ improvedType: "string", maxLength: 200 }),
          bulletPoints: fieldSchema({ improvedType: "array", maxLength: 500, maxItems: 5 }),
          description: fieldSchema({ improvedType: "string", maxLength: 2000 }),
          searchTerms: fieldSchema({ improvedType: "string", maxLength: 249 }),
          productType: fieldSchema({ improvedType: "string", maxLength: 80 }),
          brand: fieldSchema({ improvedType: "string", maxLength: 80 }),
          packageLength: fieldSchema({ improvedType: "string", maxLength: 20 }),
          packageWidth: fieldSchema({ improvedType: "string", maxLength: 20 }),
          packageHeight: fieldSchema({ improvedType: "string", maxLength: 20 }),
          packageWeight: fieldSchema({ improvedType: "string", maxLength: 20 }),
        },
      },
      summary: { type: "string", maxLength: 2000 },
      issues: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          required: ["severity", "field", "message"],
          properties: {
            severity: { type: "string", enum: ["info", "low", "medium", "high"] },
            field: { type: "string", maxLength: 40 },
            message: { type: "string", maxLength: 400 },
            ruleId: { type: ["string", "null"], maxLength: 40 },
          },
        },
      },
      noMaterialImprovement: { type: "boolean" },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Zod-Schema zur Laufzeitvalidierung (Sicherheitsnetz, falls Claude trotz Tool
// Use mal ein Feld auslässt)
// ---------------------------------------------------------------------------

const FieldOptZod = z.object({
  score: z.number().min(0).max(100),
  improved: z.union([z.string(), z.array(z.string()), z.null()]),
  reason: z.string(),
  ruleIds: z.array(z.string()).optional(),
});

const ToolInputZod = z.object({
  overallScore: z.number().min(0).max(100),
  fields: z
    .object({
      title: FieldOptZod.optional(),
      bulletPoints: FieldOptZod.optional(),
      description: FieldOptZod.optional(),
      searchTerms: FieldOptZod.optional(),
      productType: FieldOptZod.optional(),
      brand: FieldOptZod.optional(),
      packageLength: FieldOptZod.optional(),
      packageWidth: FieldOptZod.optional(),
      packageHeight: FieldOptZod.optional(),
      packageWeight: FieldOptZod.optional(),
    })
    .default({}),
  summary: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["info", "low", "medium", "high"]),
      field: z.string(),
      message: z.string(),
      ruleId: z.union([z.string(), z.null()]).optional(),
    })
  ),
  noMaterialImprovement: z.boolean(),
});

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

function emptyPayload(
  reason: string,
  partial?: Partial<AmazonTitleOptimizationPayload>
): AmazonTitleOptimizationPayload {
  return {
    usedLlm: false,
    provider: "claude",
    score: 0,
    improvedTitle: null,
    improvedBulletPoints: null,
    improvedDescription: null,
    improvedSearchTerms: null,
    summary: partial?.summary ?? "",
    issues: partial?.issues ?? [],
    noMaterialImprovement: true,
    llmSkippedReason: reason,
    ...partial,
  };
}

/**
 * Normalisiert FieldOpt → liefert string für Single-Value-Felder, nimmt den ersten
 * Eintrag bei Array-Input. bulletPoints bleibt als string[] erhalten.
 */
function toStringField(f: AmazonFieldOptimization | undefined): string | null {
  if (!f || f.improved == null) return null;
  if (Array.isArray(f.improved)) return f.improved[0] ?? null;
  return f.improved.trim() || null;
}

function toArrayField(f: AmazonFieldOptimization | undefined): string[] | null {
  if (!f || f.improved == null) return null;
  if (Array.isArray(f.improved)) {
    const cleaned = f.improved.map((s) => s.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : null;
  }
  return f.improved.trim() ? [f.improved.trim()] : null;
}

export async function runAmazonContentClaudeReview(args: {
  productContext: AmazonTitleProductContext;
  rulebookMarkdown: string;
  /** Ziel-Sprache der Vorschläge (`de_DE`, `fr_FR`, `it_IT`, ...). Default: `de_DE`. */
  targetLanguageTag?: string;
  /** Display-Name des Ziel-Marktplatzes (z. B. "Amazon Frankreich"). */
  marketplaceName?: string;
  /** Domain des Ziel-Marktplatzes (z. B. "amazon.fr"). */
  marketplaceDomain?: string;
}): Promise<AmazonTitleOptimizationPayload> {
  const { value: apiKey } = await readIntegrationSecret("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return emptyPayload("no_api_key", {
      summary:
        "Kein ANTHROPIC_API_KEY gesetzt (Umgebungsvariable oder integration_secrets). Claude-Optimierung ist deaktiviert.",
    });
  }

  const model = (process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const system = buildAmazonContentSystemPrompt(args.rulebookMarkdown, {
    targetLanguageTag: args.targetLanguageTag,
    marketplaceName: args.marketplaceName,
    marketplaceDomain: args.marketplaceDomain,
  });
  const userPayload = buildAmazonContentUserPayload(args.productContext);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const requestBody = JSON.stringify({
      model,
      max_tokens: 4000,
      system,
      tools: [TOOL_DEFINITION],
      tool_choice: { type: "tool", name: "optimize_amazon_listing" },
      messages: [{ role: "user", content: userPayload }],
    });

    const MAX_ATTEMPTS = 4;
    let res: Response | null = null;
    let lastStatus = 0;
    let lastErrText = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: requestBody,
      });
      if (res.ok) break;
      lastStatus = res.status;
      lastErrText = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status === 529 || (res.status >= 500 && res.status < 600);
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      const retryAfterHeader = Number(res.headers.get("retry-after") ?? "0");
      const baseDelay = retryAfterHeader > 0 ? retryAfterHeader * 1000 : 2_000 * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * 500);
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
    }

    if (!res || !res.ok) {
      return emptyPayload(lastStatus === 429 ? "rate_limited" : "http_error", {
        llmError: `Anthropic HTTP ${lastStatus}: ${lastErrText.slice(0, 240)}`,
        summary:
          lastStatus === 429
            ? "Claude-Ratenlimit überschritten (nach Retries). Bitte Tier erhöhen oder Anfrage später erneut stellen."
            : "Claude-Anfrage fehlgeschlagen.",
      });
    }

    const data = (await res.json()) as {
      content?: Array<{
        type: string;
        name?: string;
        input?: unknown;
        text?: string;
      }>;
      stop_reason?: string;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const toolBlock = data.content?.find(
      (b) => b.type === "tool_use" && b.name === "optimize_amazon_listing"
    );
    if (!toolBlock || !toolBlock.input) {
      return emptyPayload("empty_response", {
        llmError: "Claude lieferte keinen tool_use-Block.",
        summary: "Claude-Antwort enthielt keine strukturierten Daten.",
      });
    }

    const parsed = ToolInputZod.safeParse(toolBlock.input);
    if (!parsed.success) {
      return emptyPayload("parse_error", {
        llmError: parsed.error.message,
        summary: "Claude-Antwort entsprach nicht dem erwarteten Schema.",
      });
    }

    const v = parsed.data;
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const ctx = args.productContext;

    // Felder aufbauen — Claude-Response in internes Schema umwandeln
    const fields: AmazonOptimizedFields = {};
    if (v.fields.title) fields.title = v.fields.title;
    if (v.fields.bulletPoints) fields.bulletPoints = v.fields.bulletPoints;
    if (v.fields.description) fields.description = v.fields.description;
    if (v.fields.searchTerms) fields.searchTerms = v.fields.searchTerms;
    if (v.fields.productType) fields.productType = v.fields.productType;
    if (v.fields.brand) fields.brand = v.fields.brand;
    if (v.fields.packageLength) fields.packageLength = v.fields.packageLength;
    if (v.fields.packageWidth) fields.packageWidth = v.fields.packageWidth;
    if (v.fields.packageHeight) fields.packageHeight = v.fields.packageHeight;
    if (v.fields.packageWeight) fields.packageWeight = v.fields.packageWeight;

    // Backward-compat: Legacy-Felder aus fields ableiten
    let improvedTitle = toStringField(fields.title);
    if (improvedTitle && improvedTitle.length > 200) {
      improvedTitle = improvedTitle.slice(0, 200).trim();
    }
    if (improvedTitle && norm(improvedTitle) === norm(ctx.currentAmazonTitle)) {
      improvedTitle = null;
    }

    let improvedBulletPoints = toArrayField(fields.bulletPoints);
    if (
      improvedBulletPoints &&
      improvedBulletPoints.join("\n").toLowerCase() === ctx.bulletPoints.join("\n").toLowerCase()
    ) {
      improvedBulletPoints = null;
    }

    let improvedDescription = toStringField(fields.description);
    if (improvedDescription && norm(improvedDescription) === norm(ctx.descriptionExcerpt)) {
      improvedDescription = null;
    }

    let improvedSearchTerms = toStringField(fields.searchTerms);
    if (improvedSearchTerms && improvedSearchTerms.length > 249) {
      improvedSearchTerms = improvedSearchTerms.slice(0, 249).trim();
    }

    const anyImprovement =
      improvedTitle ||
      improvedBulletPoints ||
      improvedDescription ||
      improvedSearchTerms ||
      fields.productType?.improved ||
      fields.brand?.improved ||
      fields.packageLength?.improved ||
      fields.packageWidth?.improved ||
      fields.packageHeight?.improved ||
      fields.packageWeight?.improved;

    const issues: AmazonContentLlmIssue[] = v.issues.map((i) => ({
      severity: i.severity,
      field: i.field,
      message: i.message,
      ruleId: i.ruleId ?? null,
    }));

    return {
      usedLlm: true,
      model,
      provider: "claude",
      score: v.overallScore,
      improvedTitle,
      improvedBulletPoints,
      improvedDescription,
      improvedSearchTerms,
      fields,
      summary: v.summary.trim(),
      issues,
      noMaterialImprovement: anyImprovement ? false : Boolean(v.noMaterialImprovement),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort") || msg.includes("Abort")) {
      return emptyPayload("timeout", {
        llmError: "Zeitüberschreitung Claude.",
        summary: "Claude-Anfrage dauerte zu lange.",
      });
    }
    return emptyPayload("exception", {
      llmError: msg,
      summary: "Claude-Aufruf fehlgeschlagen.",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
