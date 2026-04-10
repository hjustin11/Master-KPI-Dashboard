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

export type AmazonTitleOptimizationPayload = {
  usedLlm: boolean;
  model?: string;
  score: number;
  improvedTitle: string | null;
  summary: string;
  issues: string[];
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
