import { z } from "zod";
import { readIntegrationSecret } from "@/shared/lib/integrationSecrets";

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_TIMEOUT_MS = 60_000;
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const TOOL_DEFINITION = {
  name: "translate_amazon_listing",
  description:
    "Übersetzt einen Amazon-Listing-Content (Titel, Beschreibung, Bullet Points, Markenname) in die Zielsprache. Behält Keywords bei, passt idiomatische Wendungen an die Zielkultur an, und hält Amazon-Richtlinien ein (Titel ≤200 Zeichen, Bullets ≤5, prägnant).",
  input_schema: {
    type: "object",
    required: ["title", "description", "bulletPoints"],
    properties: {
      title: {
        type: ["string", "null"],
        maxLength: 200,
        description: "Übersetzter Produkttitel in Zielsprache (oder null wenn keine Quelle).",
      },
      description: {
        type: ["string", "null"],
        maxLength: 2000,
        description: "Übersetzte Produktbeschreibung in Zielsprache (oder null).",
      },
      bulletPoints: {
        type: ["array", "null"],
        items: { type: "string", maxLength: 500 },
        maxItems: 5,
        description: "Übersetzte Bullet Points in Zielsprache (oder null).",
      },
      brand: {
        type: ["string", "null"],
        maxLength: 80,
        description: "Markenname — meist unverändert, nur wenn lokalisiert übersetzen.",
      },
    },
  },
} as const;

const ResultSchema = z.object({
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  bulletPoints: z.array(z.string()).nullable().optional(),
  brand: z.string().nullable().optional(),
});

export type TranslatedListingContent = {
  title: string | null;
  description: string | null;
  bulletPoints: string[] | null;
  brand: string | null;
};

export type TranslateListingArgs = {
  source: {
    title?: string;
    description?: string;
    bulletPoints?: string[];
    brand?: string;
  };
  sourceLanguageTag: string;
  targetLanguageTag: string;
  productContext?: {
    category?: string;
    productType?: string;
    brand?: string;
  };
};

const LANG_NAMES_DE: Record<string, string> = {
  de_DE: "Deutsch",
  fr_FR: "Französisch",
  fr_BE: "Französisch (Belgien)",
  it_IT: "Italienisch",
  es_ES: "Spanisch",
  nl_NL: "Niederländisch",
  pl_PL: "Polnisch",
  sv_SE: "Schwedisch",
  en_GB: "Englisch (UK)",
};

function languageName(tag: string): string {
  return LANG_NAMES_DE[tag] ?? tag;
}

function buildUserPayload(args: TranslateListingArgs): string {
  const parts: string[] = [];
  parts.push(
    `Übersetze den folgenden Amazon-Listing-Content von ${languageName(args.sourceLanguageTag)} (${args.sourceLanguageTag}) ins ${languageName(args.targetLanguageTag)} (${args.targetLanguageTag}).`
  );
  parts.push(
    "Behalte SEO-relevante Keywords bei, passe idiomatische Wendungen an die Zielkultur an, halte Amazon-Formatierungs-Richtlinien ein (Titel prägnant ≤200 Zeichen, max 5 Bullets). Übersetze die Marke NICHT — nur wenn sie wirklich lokalisiert ist."
  );
  if (args.productContext?.category || args.productContext?.productType) {
    parts.push(
      `Produktkontext: Kategorie=${args.productContext.category ?? "?"}, productType=${args.productContext.productType ?? "?"}${args.productContext.brand ? `, Marke=${args.productContext.brand}` : ""}`
    );
  }
  parts.push("\n--- Quell-Content ---");
  if (args.source.title) parts.push(`\nTitel:\n${args.source.title}`);
  if (args.source.brand) parts.push(`\nMarke:\n${args.source.brand}`);
  if (args.source.description) parts.push(`\nBeschreibung:\n${args.source.description}`);
  if (args.source.bulletPoints && args.source.bulletPoints.length > 0) {
    parts.push(`\nBullet Points:\n${args.source.bulletPoints.map((b) => `• ${b}`).join("\n")}`);
  }
  return parts.join("\n");
}

export type TranslateResult =
  | { ok: true; content: TranslatedListingContent; model: string }
  | { ok: false; error: string };

export async function translateAmazonListingContent(
  args: TranslateListingArgs
): Promise<TranslateResult> {
  const { value: apiKey } = await readIntegrationSecret("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "Kein ANTHROPIC_API_KEY gesetzt." };
  }

  if (args.sourceLanguageTag === args.targetLanguageTag) {
    return {
      ok: true,
      model: "noop",
      content: {
        title: args.source.title ?? null,
        description: args.source.description ?? null,
        bulletPoints: args.source.bulletPoints ?? null,
        brand: args.source.brand ?? null,
      },
    };
  }

  const model = (process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const requestBody = JSON.stringify({
      model,
      max_tokens: 3000,
      system:
        "Du bist ein professioneller Amazon-Listing-Übersetzer. Antworte ausschließlich über den tool_use-Block translate_amazon_listing. Übersetze vollständig und korrekt in die Zielsprache, behalte Keywords, passe an lokale Marktkonventionen an.",
      tools: [TOOL_DEFINITION],
      tool_choice: { type: "tool", name: "translate_amazon_listing" },
      messages: [{ role: "user", content: buildUserPayload(args) }],
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
      return {
        ok: false,
        error: `Anthropic HTTP ${lastStatus}: ${lastErrText.slice(0, 240)}`,
      };
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; name?: string; input?: unknown }>;
    };
    const toolBlock = data.content?.find(
      (b) => b.type === "tool_use" && b.name === "translate_amazon_listing"
    );
    if (!toolBlock?.input) {
      return { ok: false, error: "Claude lieferte keinen tool_use-Block." };
    }

    const parsed = ResultSchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message };
    }

    return {
      ok: true,
      model,
      content: {
        title: parsed.data.title ?? null,
        description: parsed.data.description ?? null,
        bulletPoints: parsed.data.bulletPoints ?? null,
        brand: parsed.data.brand ?? null,
      },
    };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return { ok: false, error: "Claude-Anfrage abgebrochen (Timeout)." };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeoutId);
  }
}
