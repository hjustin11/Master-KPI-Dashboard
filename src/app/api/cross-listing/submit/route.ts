import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { dispatchCrossListingSubmission } from "@/shared/lib/crossListing/submitListingDispatcher";
import { validateCrossListingDraft } from "@/shared/lib/crossListing/genericListingValidator";
import { getCrossListingFieldConfig } from "@/shared/lib/crossListing/marketplaceFieldConfigs";
import {
  CROSS_LISTING_TARGET_SLUGS,
  type CrossListingDraftValues,
  type CrossListingSourceMap,
  type CrossListingTargetSlug,
} from "@/shared/lib/crossListing/crossListingDraftTypes";
import { loadMarketplaceRulebook } from "@/shared/lib/crossListing/loadMarketplaceRulebook";
import {
  runCrossListingClaudeOptimize,
  limitsFromConfig,
} from "@/shared/lib/crossListing/crossListingLlmOptimize";
import { DEFAULT_AMAZON_SLUG } from "@/shared/config/amazonMarketplaces";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type DraftRow = {
  id: string;
  sku: string;
  target_marketplace_slug: string;
  generated_listing: unknown;
  user_edits: unknown;
  source_data: unknown;
  status: string;
};

function pickDraftValues(row: DraftRow): CrossListingDraftValues | null {
  const candidates = [row.user_edits, row.generated_listing];
  for (const c of candidates) {
    if (c && typeof c === "object") return c as CrossListingDraftValues;
  }
  return null;
}

function pickSourceData(row: DraftRow): CrossListingSourceMap {
  if (row.source_data && typeof row.source_data === "object") {
    return row.source_data as CrossListingSourceMap;
  }
  return {};
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
  const targetSlugRaw = typeof body.targetMarketplaceSlug === "string"
    ? body.targetMarketplaceSlug.trim()
    : "";
  const productTypeOverride =
    typeof body.productType === "string" ? body.productType.trim() : "";
  const amazonCountrySlug =
    (typeof body.amazonCountrySlug === "string" && body.amazonCountrySlug.trim()) ||
    DEFAULT_AMAZON_SLUG;
  /** Wenn true, wird AI vor Upload nochmal drübergelassen. */
  const runPreSubmitAi = body.skipAi !== true;

  if (!draftId) return NextResponse.json({ error: "draftId ist erforderlich." }, { status: 400 });
  if (!CROSS_LISTING_TARGET_SLUGS.includes(targetSlugRaw as CrossListingTargetSlug)) {
    return NextResponse.json(
      { error: `Unbekannter Marktplatz: '${targetSlugRaw}'.` },
      { status: 400 }
    );
  }
  const targetSlug = targetSlugRaw as CrossListingTargetSlug;

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
    .select("id,sku,target_marketplace_slug,generated_listing,user_edits,source_data,status")
    .eq("id", draftId)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!draftRaw) return NextResponse.json({ error: "Draft nicht gefunden." }, { status: 404 });

  const draft = draftRaw as DraftRow;
  if (draft.target_marketplace_slug !== targetSlug) {
    return NextResponse.json(
      {
        error: `Draft-Marktplatz ('${draft.target_marketplace_slug}') stimmt nicht mit Request ('${targetSlug}') überein.`,
      },
      { status: 400 }
    );
  }

  let values = pickDraftValues(draft);
  if (!values) {
    return NextResponse.json(
      { error: "Draft enthält keine editierbaren Werte (user_edits / generated_listing leer)." },
      { status: 400 }
    );
  }

  // --- 1. Generische Validierung gegen Marketplace-Field-Config -------------
  const config = getCrossListingFieldConfig(targetSlug);
  if (!config) {
    return NextResponse.json(
      { error: `Keine Feld-Konfiguration für '${targetSlug}'.` },
      { status: 400 }
    );
  }
  const validation = validateCrossListingDraft(values, config);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: "Pflichtfelder fehlen oder verletzen Marktplatz-Regeln.",
        validation: validation.errors,
        warnings: validation.warnings,
      },
      { status: 400 }
    );
  }

  // --- 2. Pre-Submit AI-Optimierung gegen Marktplatz-Richtlinien ------------
  //    Amazon ruft AI bereits im Editor-Dialog ab; für Non-Amazon läuft hier
  //    eine finale Runde, um sicherzustellen dass das Listing
  //    Marktplatz-Richtlinien entspricht (Ton, Struktur, Limits).
  const aiReport: {
    ran: boolean;
    changed: boolean;
    summary: string;
    skippedReason?: string;
    error?: string;
  } = { ran: false, changed: false, summary: "" };

  if (runPreSubmitAi && targetSlug !== "amazon") {
    try {
      const rulebook = await loadMarketplaceRulebook(targetSlug);
      if (rulebook.length > 0) {
        const limits = limitsFromConfig(config);
        const result = await runCrossListingClaudeOptimize({
          sku: draft.sku,
          target: targetSlug,
          rulebookMarkdown: rulebook,
          mergedValues: values,
          sourceData: pickSourceData(draft),
          limits,
        });
        aiReport.ran = result.usedLlm;
        aiReport.summary = result.summary;
        aiReport.skippedReason = result.llmSkippedReason;
        aiReport.error = result.llmError;
        // Auto-Apply: Nur Felder die AI verbessert hat überschreiben.
        if (result.usedLlm) {
          const next = { ...values };
          if (result.improvedTitle) next.title = result.improvedTitle;
          if (result.improvedDescription) next.description = result.improvedDescription;
          if (result.improvedBullets) next.bullets = [...result.improvedBullets];
          if (result.improvedSearchTerms) next.searchTerms = result.improvedSearchTerms;
          const changed =
            next.title !== values.title ||
            next.description !== values.description ||
            next.bullets.join("\n") !== values.bullets.join("\n") ||
            next.searchTerms !== values.searchTerms;
          if (changed) {
            values = next;
            aiReport.changed = true;
          }
        }
      } else {
        aiReport.skippedReason = "no_rulebook";
      }
    } catch (err) {
      aiReport.error = err instanceof Error ? err.message : String(err);
    }

    // Re-Validierung nach AI (Längen können sich geändert haben).
    const revalidation = validateCrossListingDraft(values, config);
    if (!revalidation.valid) {
      return NextResponse.json(
        {
          error: "AI-Optimierung hat das Listing ungültig gemacht. Bitte manuell prüfen.",
          validation: revalidation.errors,
          warnings: revalidation.warnings,
          aiReport,
        },
        { status: 400 }
      );
    }
  }

  // --- 3. Status 'uploading' setzen ----------------------------------------
  await admin
    .from("cross_listing_drafts")
    .update({
      status: "uploading",
      user_edits: values,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);

  // --- 4. Dispatcher: echte API-Submission ----------------------------------
  let submission;
  try {
    submission = await dispatchCrossListingSubmission({
      sku: draft.sku,
      values,
      targetSlug,
      amazonCountrySlug,
      productTypeOverride,
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
    return NextResponse.json({ error: message, aiReport }, { status: 500 });
  }

  // --- 5. Draft-Status fortschreiben ---------------------------------------
  const nowIso = new Date().toISOString();
  const nextStatus = submission.ok
    ? submission.preparedOnly
      ? "reviewing" // Payload vorbereitet, aber kein Real-Upload → bleibt offen
      : "uploaded"
    : "failed";
  await admin
    .from("cross_listing_drafts")
    .update({
      status: nextStatus,
      submission_id: submission.submissionId,
      submission_status: submission.status,
      submission_issues: submission.issues,
      submitted_at: nowIso,
      uploaded_at: submission.ok && !submission.preparedOnly ? nowIso : null,
      error_message: submission.ok
        ? submission.preparedOnly
          ? submission.preparedMessage ?? null
          : null
        : submission.issues.find((i) => i.severity === "ERROR")?.message ??
          "Submission fehlgeschlagen.",
      updated_by: user.id,
      updated_at: nowIso,
    })
    .eq("id", draftId);

  // --- 6. marketplace_article_mappings schreiben (bei echtem Upload) -------
  if (submission.ok && !submission.preparedOnly) {
    const eanCandidate =
      (values as unknown as { ean?: string }).ean ??
      (values as unknown as { gtin?: string }).gtin ??
      null;
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
    preparedOnly: submission.preparedOnly,
    preparedMessage: submission.preparedMessage,
    warnings: validation.warnings,
    aiReport,
  });
}
