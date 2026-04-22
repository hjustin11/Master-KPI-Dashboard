import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { isOwnerFromSources } from "@/shared/lib/roles";
import { buildAmazonProductEditorPutBody } from "@/shared/lib/amazon/productEditorPayload";
import { submitAmazonListingItem } from "@/shared/lib/amazonListingsItemsPut";
import {
  type AmazonProductDraftValues,
  normalizeDraftValues,
} from "@/shared/lib/amazonProductDraft";
import {
  DEFAULT_AMAZON_SLUG,
  getAmazonMarketplaceBySlug,
  getLanguageTagForMarketplaceId,
} from "@/shared/config/amazonMarketplaces";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getCurrentUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { user, supabase };
}

async function isOwnerUser(args: {
  user: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
}) {
  const { user, supabase } = args;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return isOwnerFromSources({
    profileRole: profile?.role,
    appRole: user.app_metadata?.role,
    userRole: user.user_metadata?.role,
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ sku: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!(await isOwnerUser(currentUser))) {
    return NextResponse.json(
      { error: "Nur Owner darf Amazon-Inhalte aktualisieren." },
      { status: 403 }
    );
  }

  const { sku: skuRaw } = await ctx.params;
  const sku = decodeURIComponent(skuRaw ?? "").trim();
  if (!sku) {
    return NextResponse.json({ error: "sku ist erforderlich." }, { status: 400 });
  }

  const reqUrl = new URL(request.url);
  const amazonSlugParam = (reqUrl.searchParams.get("amazonSlug") ?? "").trim();
  const effectiveAmazonSlug = amazonSlugParam || DEFAULT_AMAZON_SLUG;
  const resolved = getAmazonMarketplaceBySlug(effectiveAmazonSlug);
  if (!resolved) {
    return NextResponse.json(
      { error: `Unbekannter Amazon-Slug: ${effectiveAmazonSlug}` },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    draftValues?: AmazonProductDraftValues;
    productTypeFallback?: string;
  } | null;
  if (!body || !body.draftValues) {
    return NextResponse.json({ error: "draftValues fehlen im Body." }, { status: 400 });
  }

  const values = normalizeDraftValues(body.draftValues);
  const marketplaceId = resolved.marketplaceId;
  const languageTag = resolved.languageTag ?? getLanguageTagForMarketplaceId(marketplaceId);

  const built = buildAmazonProductEditorPutBody({
    values,
    marketplaceId,
    languageTag,
    productTypeFallback: body.productTypeFallback,
  });
  if (!built.ok) {
    return NextResponse.json(
      { error: "Payload ungültig.", issues: built.errors, warnings: built.warnings },
      { status: 400 }
    );
  }

  try {
    const submission = await submitAmazonListingItem({
      sku,
      marketplaceId,
      body: built.body,
    });
    return NextResponse.json({
      ok: submission.ok,
      status: submission.status,
      submissionId: submission.submissionId,
      issues: submission.issues,
      warnings: built.warnings,
      httpStatus: submission.httpStatus,
      sandbox: submission.sandbox,
      marketplaceId,
      amazonSlug: effectiveAmazonSlug,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unbekannter SP-API-Fehler." },
      { status: 500 }
    );
  }
}
