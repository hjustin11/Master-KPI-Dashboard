import { z } from "zod";
import { readIntegrationSecret } from "@/shared/lib/integrationSecrets";
import type { AmazonTitleProductContext } from "@/shared/lib/amazonTitleOptimizationContext";

const LlmTitleReviewSchema = z.object({
  score: z.number().min(0).max(100),
  improvedTitle: z.union([z.string().max(220), z.null()]),
  summary: z.string().max(4000),
  issues: z.array(z.string()).max(24),
  noMaterialImprovement: z.boolean(),
});

const LlmContentReviewSchema = z.object({
  score: z.number().min(0).max(100),
  improvedTitle: z.union([z.string().max(220), z.null()]),
  improvedBulletPoints: z.union([z.array(z.string().max(500)).max(5), z.null()]),
  improvedDescription: z.union([z.string().max(4000), z.null()]),
  improvedSearchTerms: z.union([z.string().max(300), z.null()]),
  summary: z.string().max(4000),
  issues: z.array(z.string()).max(30),
  noMaterialImprovement: z.boolean(),
});

/**
 * Strukturiertes Issue aus dem LLM — mit optionaler Regelwerk-Referenz.
 */
export type AmazonContentLlmIssue = {
  severity: "info" | "low" | "medium" | "high";
  field: string;
  message: string;
  ruleId?: string | null;
};

/**
 * Pro-Feld-Optimierung: Score + (optionaler) verbesserter Wert + Begründung.
 * Neu in 2026-Rewrite — wird von Claude-Provider befüllt.
 */
export type AmazonFieldOptimization = {
  score: number;
  /** Verbesserter Wert; null = kein Änderungsbedarf. */
  improved: string | string[] | null;
  reason: string;
  ruleIds?: string[];
};

/**
 * Struktur der neuen per-Feld-Optimierungen. Alle Felder optional.
 * Legacy-Felder (improvedTitle, improvedBulletPoints, …) bleiben befüllt für Backward-Compat.
 */
export type AmazonOptimizedFields = {
  title?: AmazonFieldOptimization;
  bulletPoints?: AmazonFieldOptimization;
  description?: AmazonFieldOptimization;
  searchTerms?: AmazonFieldOptimization;
  productType?: AmazonFieldOptimization;
  brand?: AmazonFieldOptimization;
  packageLength?: AmazonFieldOptimization;
  packageWidth?: AmazonFieldOptimization;
  packageHeight?: AmazonFieldOptimization;
  packageWeight?: AmazonFieldOptimization;
};

export type AmazonTitleOptimizationPayload = {
  usedLlm: boolean;
  model?: string;
  /** Welcher LLM-Provider kam zum Einsatz (für UI-Badge). */
  provider?: "claude" | "openai";
  score: number;
  improvedTitle: string | null;
  improvedBulletPoints?: string[] | null;
  improvedDescription?: string | null;
  improvedSearchTerms?: string | null;
  /** Neu: per-Feld-Optimierungen (Score, Vorschlag, Begründung, Regel-IDs). */
  fields?: AmazonOptimizedFields;
  summary: string;
  /** Historisch string[]; neue Provider liefern strukturierte Issues. Beides akzeptiert. */
  issues: Array<string | AmazonContentLlmIssue>;
  noMaterialImprovement: boolean;
  llmError?: string;
  /** z. B. no_api_key, timeout, parse_error */
  llmSkippedReason?: string;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 55_000;

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return s.trim();
}

export async function runAmazonTitleLlmReview(args: {
  productContext: AmazonTitleProductContext;
  rulebookExcerpt: string;
}): Promise<AmazonTitleOptimizationPayload> {
  const empty = (reason: string, partial?: Partial<AmazonTitleOptimizationPayload>): AmazonTitleOptimizationPayload => ({
    usedLlm: false,
    score: 0,
    improvedTitle: null,
    summary: partial?.summary ?? "",
    issues: partial?.issues ?? [],
    noMaterialImprovement: true,
    llmSkippedReason: reason,
    ...partial,
  });

  const { value: apiKey } = await readIntegrationSecret("OPENAI_API_KEY");
  if (!apiKey) {
    return empty("no_api_key", {
      summary:
        "Kein OPENAI_API_KEY gesetzt (Umgebungsvariable oder integration_secrets). Titel-Optimierung per LLM ist deaktiviert.",
    });
  }

  const model = (process.env.AMAZON_TITLE_LLM_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");

  const userPayload = {
    instruction:
      "Bewerte den Amazon-Listungstitel für den deutschen Marktplatz. Nutze nur Fakten aus dem JSON-Kontext und dem Regelwerk-Auszug. Erfinde keine Gewichte, Größen oder Zutaten.",
    productContext: args.productContext,
    rulebookExcerpt: args.rulebookExcerpt || "(Kein Regelwerk-Text geladen.)",
  };

  const system = [
    "Du bist ein Amazon-Listing-Experte für Haustierbedarf (DE).",
    "Antworte ausschließlich mit einem JSON-Objekt (kein Markdown), exakt dieses Schema:",
    '{"score": number 0-100, "improvedTitle": string | null, "summary": string, "issues": string[], "noMaterialImprovement": boolean}',
    "score: 100 = titelfertig nach Best Practice und Regelwerk-Kontext; niedriger bei fehlenden Kernbegriffen, Policy-Risiken oder schwacher Auffindbarkeit.",
    "improvedTitle: nur wenn du einen konkret besseren Titel vorschlagen kannst; max. 200 Zeichen; deutsch; keine Begriffe wie Sonderangebot, Bestseller, gratis, Prime-Werbung.",
    "Wenn der aktuelle Titel bereits ausreicht: improvedTitle null, noMaterialImprovement true, issues leer oder nur minimale Hinweise.",
    "issues: kurze deutsche Stichpunkte, was am aktuellen Titel fehlt oder riskant ist.",
  ].join("\n");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return empty("http_error", {
        llmError: `OpenAI HTTP ${res.status}: ${errText.slice(0, 200)}`,
        summary: "LLM-Anfrage fehlgeschlagen.",
      });
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return empty("empty_response", { llmError: "Leere LLM-Antwort.", summary: "LLM lieferte keinen Text." });
    }

    let json: unknown;
    try {
      json = JSON.parse(stripJsonFences(content));
    } catch {
      return empty("parse_error", {
        llmError: "Ungültiges JSON in LLM-Antwort.",
        summary: "LLM-Antwort war kein gültiges JSON.",
      });
    }
    const parsed = LlmTitleReviewSchema.safeParse(json);
    if (!parsed.success) {
      return empty("parse_error", {
        llmError: parsed.error.message,
        summary: "LLM-Antwort konnte nicht verarbeitet werden.",
      });
    }

    const v = parsed.data;
    let improved = v.improvedTitle?.trim() ?? null;
    if (improved && improved.length > 200) improved = improved.slice(0, 200).trim();

    const current = args.productContext.currentAmazonTitle.replace(/\s+/g, " ").trim().toLowerCase();
    const improvedNorm = improved?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
    const sameAsCurrent = Boolean(improved && current === improvedNorm);
    const finalImproved = sameAsCurrent ? null : improved;

    return {
      usedLlm: true,
      model,
      score: v.score,
      improvedTitle: finalImproved,
      summary: v.summary.trim(),
      issues: v.issues.map((x) => x.trim()).filter(Boolean),
      noMaterialImprovement: finalImproved ? false : Boolean(v.noMaterialImprovement),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort") || msg.includes("Abort")) {
      return empty("timeout", { llmError: "Zeitüberschreitung LLM.", summary: "LLM-Anfrage dauerte zu lange." });
    }
    return empty("exception", { llmError: msg, summary: "LLM-Aufruf fehlgeschlagen." });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Vollständige Content-Prüfung: Titel, Bullet Points, Beschreibung und Suchbegriffe per LLM optimieren.
 */
export async function runAmazonContentLlmReview(args: {
  productContext: AmazonTitleProductContext;
  rulebookMarkdown: string;
}): Promise<AmazonTitleOptimizationPayload> {
  const empty = (reason: string, partial?: Partial<AmazonTitleOptimizationPayload>): AmazonTitleOptimizationPayload => ({
    usedLlm: false,
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
  });

  const { value: apiKey } = await readIntegrationSecret("OPENAI_API_KEY");
  if (!apiKey) {
    return empty("no_api_key", {
      summary:
        "Kein OPENAI_API_KEY gesetzt (Umgebungsvariable oder integration_secrets). Content-Optimierung per LLM ist deaktiviert.",
    });
  }

  const model = (process.env.AMAZON_TITLE_LLM_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");

  const ctx = args.productContext;
  const userPayload = {
    instruction: [
      "Prüfe und optimiere das komplette Amazon-Listing für den deutschen Marktplatz (Kategorie Haustierbedarf).",
      "Bewerte ALLE Felder anhand des Regelwerks: Titel, Bullet Points, Produktbeschreibung und Suchbegriffe.",
      "Für jedes Feld: Schlage einen verbesserten Wert vor, WENN es Verbesserungspotenzial gibt.",
      "Nutze nur Fakten aus dem JSON-Kontext und dem Regelwerk. Erfinde keine Gewichte, Größen oder Zutaten.",
      "Wenn ein Feld bereits gut ist, setze den Wert auf null.",
    ].join(" "),
    productContext: {
      sku: ctx.sku,
      asin: ctx.asin,
      currentAmazonTitle: ctx.currentAmazonTitle,
      brand: ctx.brand,
      productType: ctx.productType,
      conditionType: ctx.conditionType,
      bulletPoints: ctx.bulletPoints,
      description: ctx.descriptionExcerpt,
      attributes: ctx.attributes,
      externalProductId: ctx.externalProductId,
      externalProductIdType: ctx.externalProductIdType,
      shopify: ctx.shopify,
    },
    rulebookMarkdown: args.rulebookMarkdown
      ? args.rulebookMarkdown.slice(0, 24000)
      : "(Kein Regelwerk-Text geladen.)",
  };

  const system = [
    "Du bist ein Amazon-Listing-Experte für Haustierbedarf (DE).",
    "Antworte ausschließlich mit einem JSON-Objekt (kein Markdown), exakt dieses Schema:",
    JSON.stringify({
      score: "number 0-100",
      improvedTitle: "string | null (max 200 Zeichen)",
      improvedBulletPoints: "string[] | null (max 5 Einträge, je max 500 Zeichen)",
      improvedDescription: "string | null (max 2000 Zeichen, Fließtext)",
      improvedSearchTerms: "string | null (max 249 Zeichen, Komma-getrennt)",
      summary: "string (kurze Gesamtbewertung)",
      issues: "string[] (Stichpunkte: was fehlt oder riskant ist)",
      noMaterialImprovement: "boolean",
    }),
    "",
    "REGELN FÜR DIE BEWERTUNG:",
    "score: 100 = Listing komplett regelkonform und optimiert; niedriger bei Regelwerkverstößen, fehlenden Kernbegriffen, schwacher Auffindbarkeit.",
    "",
    "TITEL (improvedTitle):",
    "- Max. 200 Zeichen (Regelwerk empfiehlt 80), deutsch, Marke vorne.",
    "- Keine verbotenen Begriffe: Sonderangebot, Bestseller, gratis, Prime, Sale, Rabatt, Versandkostenfrei.",
    "- Keine Symbole: !, ?, *, €, ®, ©, ™. Keine HTML-Tags.",
    "- Zahlen als Ziffern. Maßeinheiten mit Leerzeichen (z.B. '500 ml', '3,6 kg').",
    "- Format: [Marke] + [Produktbezeichnung] + [Spezifikation] + [Variante] + [Menge].",
    "",
    "BULLET POINTS (improvedBulletPoints):",
    "- Genau 5 Bullet Points, je mit Großbuchstaben beginnend.",
    "- Nutzenorientiert, konkret, keine vagen Aussagen.",
    "- Keine Preise, Versandinfos oder Werbung.",
    "- Erster Bullet = Kernmerkmal der Sub-Kategorie (Tierfutter: Zielgruppe/Inhaltsstoffe; Spielzeug: Entwicklungsvorteil).",
    "- Bei Mehrfachpackungen: Erster Bullet = Packungsinhalt-Aufschlüsselung.",
    "",
    "BESCHREIBUNG (improvedDescription):",
    "- Fließtext (keine Stichpunkte), mind. 150 Zeichen.",
    "- Alleinstellungsmerkmale, Nutzen aus Kundensicht, Anwendung.",
    "- Keine Preise, Versand- oder Händlerinfos.",
    "",
    "SUCHBEGRIFFE (improvedSearchTerms):",
    "- Max. 249 Zeichen, Komma-getrennt.",
    "- Nur Begriffe, die NICHT bereits im Titel oder Bullets vorkommen.",
    "- Keine Marke, keine subjektiven Adjektive, keine generischen Begriffe wie 'Hund' oder 'Katze'.",
    "- Synonyme und alternative Bezeichnungen verwenden.",
    "",
    "Wenn ein Feld bereits ausreichend gut ist: Wert auf null setzen. noMaterialImprovement = true nur wenn ALLE Felder bereits gut sind.",
    "issues: kurze deutsche Stichpunkte zu Regelverstößen oder Optimierungspotenzial.",
  ].join("\n");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return empty("http_error", {
        llmError: `OpenAI HTTP ${res.status}: ${errText.slice(0, 200)}`,
        summary: "LLM-Anfrage fehlgeschlagen.",
      });
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return empty("empty_response", { llmError: "Leere LLM-Antwort.", summary: "LLM lieferte keinen Text." });
    }

    let json: unknown;
    try {
      json = JSON.parse(stripJsonFences(content));
    } catch {
      return empty("parse_error", {
        llmError: "Ungültiges JSON in LLM-Antwort.",
        summary: "LLM-Antwort war kein gültiges JSON.",
      });
    }
    const parsed = LlmContentReviewSchema.safeParse(json);
    if (!parsed.success) {
      return empty("parse_error", {
        llmError: parsed.error.message,
        summary: "LLM-Antwort konnte nicht verarbeitet werden.",
      });
    }

    const v = parsed.data;
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

    let improvedTitle = v.improvedTitle?.trim() ?? null;
    if (improvedTitle && improvedTitle.length > 200) improvedTitle = improvedTitle.slice(0, 200).trim();
    if (improvedTitle && norm(improvedTitle) === norm(ctx.currentAmazonTitle)) improvedTitle = null;

    let improvedBulletPoints = v.improvedBulletPoints?.map((b) => b.trim()).filter(Boolean) ?? null;
    if (improvedBulletPoints && improvedBulletPoints.length === 0) improvedBulletPoints = null;
    if (
      improvedBulletPoints &&
      improvedBulletPoints.join("\n").toLowerCase() === ctx.bulletPoints.join("\n").toLowerCase()
    ) {
      improvedBulletPoints = null;
    }

    let improvedDescription = v.improvedDescription?.trim() ?? null;
    if (improvedDescription && norm(improvedDescription) === norm(ctx.descriptionExcerpt)) {
      improvedDescription = null;
    }

    let improvedSearchTerms = v.improvedSearchTerms?.trim() ?? null;
    if (improvedSearchTerms && improvedSearchTerms.length > 249) {
      improvedSearchTerms = improvedSearchTerms.slice(0, 249).trim();
    }

    const anyImprovement = improvedTitle || improvedBulletPoints || improvedDescription || improvedSearchTerms;

    return {
      usedLlm: true,
      model,
      score: v.score,
      improvedTitle,
      improvedBulletPoints,
      improvedDescription,
      improvedSearchTerms,
      summary: v.summary.trim(),
      issues: v.issues.map((x) => x.trim()).filter(Boolean),
      noMaterialImprovement: anyImprovement ? false : Boolean(v.noMaterialImprovement),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort") || msg.includes("Abort")) {
      return empty("timeout", { llmError: "Zeitüberschreitung LLM.", summary: "LLM-Anfrage dauerte zu lange." });
    }
    return empty("exception", { llmError: msg, summary: "LLM-Aufruf fehlgeschlagen." });
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Provider-Router — wählt zwischen Claude (primär) und OpenAI (Fallback)
// ---------------------------------------------------------------------------

/**
 * Einstiegspunkt für die Content-Audit-Route. Wählt den LLM-Provider
 * basierend auf AMAZON_LLM_PROVIDER (default "claude") und der Verfügbarkeit
 * der API-Keys.
 *
 * Fallback-Kette: claude → openai → (leerer Payload mit Grund "no_api_key")
 */
export async function runAmazonContentOptimization(args: {
  productContext: AmazonTitleProductContext;
  rulebookMarkdown: string;
}): Promise<AmazonTitleOptimizationPayload> {
  const provider = (process.env.AMAZON_LLM_PROVIDER ?? "claude").trim().toLowerCase();

  if (provider === "claude" || provider === "") {
    const { value: claudeKey } = await readIntegrationSecret("ANTHROPIC_API_KEY");
    if (claudeKey) {
      // Dynamischer Import um potenzielle Zirkular-Imports zu vermeiden
      // (claude-Modul importiert Typen aus dieser Datei).
      const { runAmazonContentClaudeReview } = await import(
        "@/shared/lib/amazonContentLlmClaude"
      );
      return runAmazonContentClaudeReview(args);
    }
  }

  // Fallback auf OpenAI
  const { value: openaiKey } = await readIntegrationSecret("OPENAI_API_KEY");
  if (openaiKey) {
    return runAmazonContentLlmReview(args);
  }

  // Kein Provider verfügbar
  return {
    usedLlm: false,
    provider: provider === "openai" ? "openai" : "claude",
    score: 0,
    improvedTitle: null,
    improvedBulletPoints: null,
    improvedDescription: null,
    improvedSearchTerms: null,
    summary:
      "Weder ANTHROPIC_API_KEY noch OPENAI_API_KEY ist gesetzt. LLM-Content-Optimierung ist deaktiviert.",
    issues: [],
    noMaterialImprovement: true,
    llmSkippedReason: "no_api_key",
  };
}
