/**
 * Server-side helper to read/write the runtime marketplace config from Supabase.
 * The static catalog (`AMAZON_EU_MARKETPLACES`) stays the source of truth for
 * which countries exist. The DB table `amazon_marketplace_config` tells us
 * which ones are currently enabled and carries per-country runtime metadata.
 */

import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  AMAZON_EU_MARKETPLACES,
  type AmazonMarketplaceConfig,
} from "@/shared/config/amazonMarketplaces";

export type AmazonMarketplaceRuntimeConfig = AmazonMarketplaceConfig & {
  /** DB-driven enabled flag (overrides the static default). */
  enabledInDb: boolean;
  activatedAt: string | null;
  lastSyncAt: string | null;
  lastParticipationCheckAt: string | null;
  participationCheckOk: boolean | null;
};

type DbRow = {
  marketplace_id: string;
  slug: string;
  enabled: boolean | null;
  activated_at: string | null;
  last_sync_at: string | null;
  last_participation_check_at: string | null;
  participation_check_ok: boolean | null;
};

/**
 * Merges the static catalog with the DB-backed runtime status.
 * If the DB is missing or the table doesn't exist yet, falls back to the
 * static `enabled` flags so the app keeps working.
 */
export async function getAmazonMarketplacesWithDbStatus(): Promise<AmazonMarketplaceRuntimeConfig[]> {
  let rows: DbRow[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("amazon_marketplace_config")
      .select(
        "marketplace_id, slug, enabled, activated_at, last_sync_at, last_participation_check_at, participation_check_ok"
      );
    if (Array.isArray(data)) rows = data as DbRow[];
  } catch {
    // Migration not applied or DB down: fall back to static defaults.
  }

  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  return AMAZON_EU_MARKETPLACES.map((m) => {
    const row = bySlug.get(m.slug);
    return {
      ...m,
      enabledInDb: row?.enabled ?? m.enabled,
      activatedAt: row?.activated_at ?? null,
      lastSyncAt: row?.last_sync_at ?? null,
      lastParticipationCheckAt: row?.last_participation_check_at ?? null,
      participationCheckOk: row?.participation_check_ok ?? null,
    };
  });
}

export async function getEnabledAmazonMarketplaceSlugs(): Promise<string[]> {
  const all = await getAmazonMarketplacesWithDbStatus();
  return all.filter((m) => m.enabledInDb).map((m) => m.slug);
}

export async function setAmazonMarketplaceEnabled(
  slug: string,
  enabled: boolean,
  options?: { participationCheckOk?: boolean | null }
): Promise<void> {
  const marketplace = AMAZON_EU_MARKETPLACES.find((m) => m.slug === slug);
  if (!marketplace) throw new Error(`Unknown Amazon slug: ${slug}`);
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const row = {
    marketplace_id: marketplace.marketplaceId,
    slug: marketplace.slug,
    enabled,
    activated_at: enabled ? nowIso : null,
    last_participation_check_at:
      options?.participationCheckOk !== undefined ? nowIso : null,
    participation_check_ok: options?.participationCheckOk ?? null,
    updated_at: nowIso,
  };
  await admin
    .from("amazon_marketplace_config")
    .upsert(row, { onConflict: "marketplace_id" });
}
