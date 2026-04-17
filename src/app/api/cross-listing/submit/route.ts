import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { buildAmazonListingPutBody } from "@/shared/lib/crossListing/amazonListingPayload";
import { submitAmazonListingItem } from "@/shared/lib/amazonListingsItemsPut";
import type {
  CrossListingDraftValues,
  CrossListingTargetSlug,
} from "@/shared/lib/crossListing/crossListingDraftTypes";
import {
  DEFAULT_AMAZON_SLUG,
  getAmazonMarketplaceBySlug,
  getLanguageTagForMarketplaceId,
} from "@/shared/config/amazonMarketplaces";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DraftRow = {
  id: string;
  sku: string;
  target_marketplace_slug: string;
  generated_listing: unknown;
  user_edits: unknown;
  status: string;
};

function pickDraftValues(row: DraftRow): CrossListingDraftValues | null {
  const candidates = [row.user_edits, row.generated_listing];
  for (const c of candidates) {
    if (c && typeof c === "object") return c as CrossListingDraftValues;
  }
  return null;
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

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });

  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  const targetSlug = (typeof body.targetMarketplaceSlug === "string"
    ? body.targetMarketplaceSlug.trim()
    : "") as CrossListingTargetSlug;
  const productTypeOverride =
    typeof body.productType === "string" ? body.productType.trim() : "";
  // Amazon-Country-Slug (`amazon-de`, `amazon-fr`, ...) — default DE.
  const amazonCountrySlug =
    (typeof body.amazonCountrySlug === "string" && body.amazonCountrySlug.trim()) ||
    DEFAULT_AMAZON_SLUG;

  if (!draftId) return NextResponse.json({ error: "draftId ist erforderlich." }, { status: 400 });
  if (targetSlug !== "amazon") {
    return NextResponse.json(
      { error: `Upload für '${targetSlug}' ist noch nicht verfügbar (V1.3 = nur Amazon).` },
      { status: 400 }
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server-Konfiguration unvollständig (Supabase Service Role)." },
      { status: 503 }
    );
  }

  const { data: draftRaw, error: loadErr } = await admin
    .from("cross_listing_drafts")
    .select("id,sku,target_marketplace_slug,generated_listing,user_edits,status")
    .eq("id", draftId)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!draftRaw) return NextResponse.json({ error: "Draft nicht gefunden." }, { status: 404 });

  const draft = draftRaw as DraftRow;
  if (draft.target_marketplace_slug !== "amazon") {
    return NextResponse.json(
      { error: "Draft-Target-Marketplace ist nicht Amazon." },
      { status: 400 }
    );
  }

  const values = pickDraftValues(draft);
  if (!values) {
    return NextResponse.json(
      { error: "Draft enthält keine editierbaren Werte (user_edits / generated_listing leer)." },
      { status: 400 }
    );
  }

  // Amazon-Country-Slug → konkrete marketplace_id (z. B. amazon-fr = A13V1IB3VIYZZH).
  const amazonCountryConfig = getAmazonMarketplaceBySlug(amazonCountrySlug);
  if (!amazonCountryConfig) {
    return NextResponse.json(
      { error: `Unbekannter Amazon-Slug: ${amazonCountrySlug}` },
      { status: 400 }
    );
  }
  const marketplaceId = amazonCountryConfig.marketplaceId;
  const languageTag = getLanguageTagForMarketplaceId(marketplaceId);

  const productType = productTypeOverride || values.amazonProductType || "PET_SUPPLIES";
  const built = buildAmazonListingPutBody({
    values,
    marketplaceId,
    productType,
    sku: draft.sku,
    languageTag,
  });

  if (!built.ok) {
    return NextResponse.json(
      { error: "Pflichtfelder fehlen.", validation: built.errors, warnings: built.warnings },
      { status: 400 }
    );
  }

  await admin
    .from("cross_listing_drafts")
    .update({
      status: "uploading",
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);

  let submission;
  try {
    submission = await submitAmazonListingItem({
      sku: draft.sku,
      marketplaceId,
      body: built.body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
    await admin
      .from("cross_listing_drafts")
      .update({
        status: "failed",
        error_message: message,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const nextStatus = submission.ok ? "uploaded" : "failed";
  const nowIso = new Date().toISOString();
  await admin
    .from("cross_listing_drafts")
    .update({
      status: nextStatus,
      submission_id: submission.submissionId,
      submission_status: submission.status,
      submission_issues: submission.issues,
      submitted_at: nowIso,
      uploaded_at: submission.ok ? nowIso : null,
      error_message: submission.ok
        ? null
        : submission.issues.find((i) => i.severity === "ERROR")?.message ?? "Submission fehlgeschlagen.",
      updated_by: user.id,
      updated_at: nowIso,
    })
    .eq("id", draftId);

  // AATB-004-Fix: Listing-Mapping schreiben, damit Price-Parity den Artikel
  // als "verbunden" erkennt — auch bevor die nächste Produkt-Cache-Aktualisierung läuft.
  if (submission.ok) {
    const eanCandidate =
      (values as unknown as { ean?: string }).ean ??
      (values as unknown as { gtin?: string }).gtin ??
      null;
    // Für Amazon-Uploads schreiben wir das Mapping unter dem Country-Slug
    // (z. B. amazon-fr), damit Price-Parity später genau das richtige Land
    // als "verbunden" erkennt.
    const mappingSlug = targetSlug === "amazon" ? amazonCountrySlug : targetSlug;
    try {
      await admin.from("marketplace_article_mappings").upsert(
        {
          xentral_sku: draft.sku,
          marketplace_slug: mappingSlug,
          marketplace_sku: draft.sku,
          ean: eanCandidate,
          match_type: "manual",
          confidence: 1.0,
          verified_at: nowIso,
          created_by: user.id,
          updated_at: nowIso,
        },
        { onConflict: "xentral_sku,marketplace_slug" }
      );
    } catch {
      // Mapping-Tabelle kann in alten Envs fehlen — Upload bleibt erfolgreich.
    }
  }

  return NextResponse.json({
    ok: submission.ok,
    submissionId: submission.submissionId,
    status: submission.status,
    issues: submission.issues,
    httpStatus: submission.httpStatus,
    sandbox: submission.sandbox,
    endpointUsed: submission.endpointUsed,
    warnings: built.warnings,
  });
}
