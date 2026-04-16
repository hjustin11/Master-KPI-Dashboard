import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import {
  runCrossListingClaudeOptimize,
  limitsFromConfig,
  type CrossListingLlmResult,
} from "@/shared/lib/crossListing/crossListingLlmOptimize";
import { getCrossListingFieldConfig } from "@/shared/lib/crossListing/marketplaceFieldConfigs";
import {
  CROSS_LISTING_TARGET_SLUGS,
  type CrossListingTargetSlug,
} from "@/shared/lib/crossListing/crossListingDraftTypes";

export const dynamic = "force-dynamic";

const DraftValuesZ = z.object({
  title: z.string(),
  description: z.string(),
  bullets: z.array(z.string()),
  images: z.array(z.string()),
  priceEur: z.string(),
  uvpEur: z.string(),
  stockQty: z.string(),
  ean: z.string(),
  brand: z.string(),
  category: z.string(),
  dimL: z.string(),
  dimW: z.string(),
  dimH: z.string(),
  weight: z.string(),
  petSpecies: z.string(),
  tags: z.array(z.string()),
  searchTerms: z.string(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  condition: z.string(),
  handlingTime: z.string(),
  attributes: z.record(z.string(), z.string()),
});

const SourceRecordZ = z.object({
  slug: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  bullets: z.array(z.string()),
  images: z.array(z.string()),
  priceEur: z.number().nullable(),
  uvpEur: z.number().nullable(),
  stockQty: z.number().nullable(),
  ean: z.string().nullable(),
  brand: z.string().nullable(),
  category: z.string().nullable(),
  dimL: z.number().nullable(),
  dimW: z.number().nullable(),
  dimH: z.number().nullable(),
  weight: z.number().nullable(),
  petSpecies: z.string().nullable(),
  tags: z.array(z.string()),
  attributes: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
});

const BodyZ = z.object({
  sku: z.string().min(1),
  targetMarketplace: z.enum(CROSS_LISTING_TARGET_SLUGS as readonly [
    CrossListingTargetSlug,
    ...CrossListingTargetSlug[]
  ]),
  mergedValues: DraftValuesZ,
  sourceData: z.record(z.string(), SourceRecordZ.nullable()),
});

async function firstExistingPath(candidates: string[]): Promise<string | null> {
  for (const c of candidates) {
    try {
      await access(c);
      return c;
    } catch {
      continue;
    }
  }
  return null;
}

async function loadRulebook(slug: CrossListingTargetSlug): Promise<string> {
  const cwd = process.cwd();
  const candidates = [
    process.env.CROSS_LISTING_GUIDELINES_DIR
      ? path.join(process.env.CROSS_LISTING_GUIDELINES_DIR, `${slug}.md`)
      : null,
    path.join(cwd, "content", "marketplace_guidelines", `${slug}.md`),
    path.join(cwd, "master-dashboard", "content", "marketplace_guidelines", `${slug}.md`),
    slug === "amazon" ? path.join(cwd, "content", "amazon_haustierbedarf_regelwerk.md") : null,
    slug === "amazon"
      ? path.join(cwd, "master-dashboard", "content", "amazon_haustierbedarf_regelwerk.md")
      : null,
  ].filter((x): x is string => Boolean(x));

  const found = await firstExistingPath(candidates);
  if (!found) return "";
  try {
    return await readFile(found, "utf8");
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const bodyRaw = (await request.json().catch(() => null)) as unknown;
  const parsed = BodyZ.safeParse(bodyRaw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Ungültiger Body: ${parsed.error.issues.map((i) => i.message).join("; ")}` },
      { status: 400 }
    );
  }

  const config = getCrossListingFieldConfig(parsed.data.targetMarketplace);
  if (!config) {
    return NextResponse.json({ error: "Unbekannter Ziel-Marktplatz." }, { status: 400 });
  }

  const rulebook = await loadRulebook(parsed.data.targetMarketplace);
  const limits = limitsFromConfig(config);

  const result: CrossListingLlmResult = await runCrossListingClaudeOptimize({
    sku: parsed.data.sku,
    target: parsed.data.targetMarketplace,
    rulebookMarkdown: rulebook,
    mergedValues: parsed.data.mergedValues,
    sourceData: parsed.data.sourceData,
    limits,
  });

  return NextResponse.json({
    result,
    rulebookLoaded: rulebook.length > 0,
  });
}
