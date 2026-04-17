import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { isEntwicklerProfileRole } from "@/shared/lib/roles";
import {
  getAmazonMarketplaceBySlug,
  DEFAULT_AMAZON_SLUG,
} from "@/shared/config/amazonMarketplaces";
import { setAmazonMarketplaceEnabled } from "@/shared/lib/amazon/marketplaceConfigDb";
import {
  getAmazonProductsLwaToken,
  loadAmazonSpApiProductsConfig,
  spApiRequest,
} from "@/shared/lib/amazonProductsSpApiCatalog";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ParticipationsPayload = {
  payload?: Array<{
    marketplace?: { id?: string };
    participation?: { isParticipating?: boolean };
  }>;
};

async function checkSellerParticipation(marketplaceId: string): Promise<{
  ok: boolean;
  reason: string | null;
}> {
  try {
    const config = await loadAmazonSpApiProductsConfig();
    if (!config.refreshToken || !config.lwaClientId || !config.lwaClientSecret) {
      return { ok: false, reason: "Amazon SP-API Credentials fehlen." };
    }
    const lwaAccessToken = await getAmazonProductsLwaToken(config);
    const probe = await spApiRequest({
      endpoint: config.endpoint,
      region: config.region,
      method: "GET",
      path: "/sellers/v1/marketplaceParticipations",
      query: {},
      awsAccessKeyId: config.awsAccessKeyId,
      awsSecretAccessKey: config.awsSecretAccessKey,
      awsSessionToken: config.awsSessionToken,
      lwaAccessToken,
    });
    if (!probe.res.ok || !probe.json) {
      return { ok: false, reason: `Participations-API ${probe.res.status}` };
    }
    const payload = probe.json as ParticipationsPayload;
    const participations = Array.isArray(payload.payload) ? payload.payload : [];
    const match = participations.find((entry) => entry.marketplace?.id === marketplaceId);
    if (!match) {
      return {
        ok: false,
        reason: "Seller ist auf diesem Marktplatz nicht registriert. Bitte zuerst im Seller Central registrieren.",
      };
    }
    if (match.participation?.isParticipating === false) {
      return { ok: false, reason: "Participation ist auf diesem Marktplatz deaktiviert." };
    }
    return { ok: true, reason: null };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Unbekannter Fehler." };
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isEntwicklerProfileRole(profile?.role)) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { slug?: string } | null;
  const slug = (body?.slug ?? "").trim();
  const marketplace = getAmazonMarketplaceBySlug(slug);
  if (!marketplace) {
    return NextResponse.json({ error: `Unbekannter Slug: ${slug}` }, { status: 400 });
  }
  if (slug === DEFAULT_AMAZON_SLUG) {
    // DE bleibt immer aktiv; kein Participation-Check nötig.
    await setAmazonMarketplaceEnabled(slug, true, { participationCheckOk: true });
    return NextResponse.json({ ok: true, slug, skippedCheck: true });
  }

  const check = await checkSellerParticipation(marketplace.marketplaceId);
  if (!check.ok) {
    // Wir speichern das fehlgeschlagene Check-Ergebnis, damit die UI es anzeigen kann.
    await setAmazonMarketplaceEnabled(slug, false, { participationCheckOk: false });
    return NextResponse.json(
      { ok: false, slug, error: check.reason ?? "Participation-Check fehlgeschlagen." },
      { status: 409 }
    );
  }

  await setAmazonMarketplaceEnabled(slug, true, { participationCheckOk: true });
  return NextResponse.json({ ok: true, slug });
}
