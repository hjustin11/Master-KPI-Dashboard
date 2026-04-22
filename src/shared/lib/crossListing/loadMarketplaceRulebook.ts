import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { CrossListingTargetSlug } from "./crossListingDraftTypes";

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

/** Lädt die Marktplatz-Richtlinien (Markdown). Gibt "" zurück wenn nicht gefunden. */
export async function loadMarketplaceRulebook(slug: CrossListingTargetSlug): Promise<string> {
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
