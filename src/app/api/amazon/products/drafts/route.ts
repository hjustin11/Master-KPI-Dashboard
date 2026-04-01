import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { isOwnerFromSources } from "@/shared/lib/roles";
import {
  type AmazonProductDraftMode,
  type AmazonProductDraftRecord,
  deriveDraftStatus,
  emptyDraftValues,
  normalizeDraftValues,
  normalizeSourceSnapshot,
} from "@/shared/lib/amazonProductDraft";

type DraftRow = AmazonProductDraftRecord;

function isMissingDraftsTable(err: { code?: string; message?: string } | null | undefined) {
  if (!err) return false;
  if (err.code === "42P01") return true;
  const msg = err.message ?? "";
  return /amazon_product_drafts|does not exist|schema cache/i.test(msg);
}

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

function parseMode(input: unknown): AmazonProductDraftMode {
  return input === "create_new" ? "create_new" : "edit_existing";
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  if (!(await isOwnerUser(currentUser))) {
    return NextResponse.json({ error: "Nur Owner darf Produkt-Entwürfe verwalten." }, { status: 403 });
  }

  const url = new URL(request.url);
  const sku = url.searchParams.get("sku")?.trim() ?? "";
  const mode = parseMode(url.searchParams.get("mode"));

  const admin = createAdminClient();
  let query = admin
    .from("amazon_product_drafts")
    .select("*")
    .eq("marketplace_slug", "amazon")
    .eq("mode", mode)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (sku) query = query.eq("sku", sku);

  const { data, error } = await query;
  if (isMissingDraftsTable(error as { code?: string; message?: string } | undefined)) {
    return NextResponse.json({ item: null, items: [], tableMissing: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = ((data ?? []) as DraftRow[]).map((row) => ({
    ...row,
    source_snapshot: normalizeSourceSnapshot(row.source_snapshot),
    draft_values: normalizeDraftValues(row.draft_values),
  }));
  return NextResponse.json({ item: items[0] ?? null, items });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  if (!(await isOwnerUser(currentUser))) {
    return NextResponse.json({ error: "Nur Owner darf Produkt-Entwürfe verwalten." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        mode?: AmazonProductDraftMode;
        sku?: string | null;
        sourceSnapshot?: unknown;
        draftValues?: unknown;
      }
    | null;
  const mode = parseMode(body?.mode);
  const sku = typeof body?.sku === "string" ? body.sku.trim() : "";
  if (mode === "edit_existing" && !sku) {
    return NextResponse.json({ error: "sku ist für edit_existing erforderlich." }, { status: 400 });
  }

  const source = normalizeSourceSnapshot(body?.sourceSnapshot);
  const draftValues = normalizeDraftValues(body?.draftValues ?? emptyDraftValues());
  const status = deriveDraftStatus(draftValues, mode);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("amazon_product_drafts")
    .insert({
      marketplace_slug: "amazon",
      mode,
      sku: sku || null,
      source_snapshot: source,
      draft_values: draftValues,
      status,
      created_by: currentUser.user.id,
      updated_by: currentUser.user.id,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (isMissingDraftsTable(error as { code?: string; message?: string } | undefined)) {
    return NextResponse.json(
      { error: "Tabelle 'amazon_product_drafts' fehlt. Bitte Migration ausführen." },
      { status: 503 }
    );
  }
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Entwurf konnte nicht erstellt werden." }, { status: 500 });
  }
  return NextResponse.json({ item: data as DraftRow }, { status: 201 });
}

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  if (!(await isOwnerUser(currentUser))) {
    return NextResponse.json({ error: "Nur Owner darf Produkt-Entwürfe verwalten." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        id?: string;
        mode?: AmazonProductDraftMode;
        sku?: string | null;
        sourceSnapshot?: unknown;
        draftValues?: unknown;
      }
    | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const mode = parseMode(body?.mode);
  const sku = typeof body?.sku === "string" ? body.sku.trim() : "";
  if (!id && mode === "edit_existing" && !sku) {
    return NextResponse.json({ error: "id oder sku ist erforderlich." }, { status: 400 });
  }

  const source = normalizeSourceSnapshot(body?.sourceSnapshot);
  const draftValues = normalizeDraftValues(body?.draftValues ?? emptyDraftValues());
  const status = deriveDraftStatus(draftValues, mode);
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  if (id) {
    const { data, error } = await admin
      .from("amazon_product_drafts")
      .update({
        mode,
        sku: sku || null,
        source_snapshot: source,
        draft_values: draftValues,
        status,
        updated_by: currentUser.user.id,
        updated_at: nowIso,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (isMissingDraftsTable(error as { code?: string; message?: string } | undefined)) {
      return NextResponse.json(
        { error: "Tabelle 'amazon_product_drafts' fehlt. Bitte Migration ausführen." },
        { status: 503 }
      );
    }
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Entwurf konnte nicht gespeichert werden." }, { status: 500 });
    }
    return NextResponse.json({ item: data as DraftRow });
  }

  const existing = await admin
    .from("amazon_product_drafts")
    .select("id")
    .eq("marketplace_slug", "amazon")
    .eq("mode", mode)
    .eq("sku", sku)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error && !isMissingDraftsTable(existing.error as { code?: string; message?: string } | undefined)) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }
  if (isMissingDraftsTable(existing.error as { code?: string; message?: string } | undefined)) {
    return NextResponse.json(
      { error: "Tabelle 'amazon_product_drafts' fehlt. Bitte Migration ausführen." },
      { status: 503 }
    );
  }
  if (existing.data?.id) {
    const { data, error } = await admin
      .from("amazon_product_drafts")
      .update({
        source_snapshot: source,
        draft_values: draftValues,
        status,
        updated_by: currentUser.user.id,
        updated_at: nowIso,
      })
      .eq("id", existing.data.id)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Entwurf konnte nicht gespeichert werden." }, { status: 500 });
    }
    return NextResponse.json({ item: data as DraftRow });
  }

  const { data, error } = await admin
    .from("amazon_product_drafts")
    .insert({
      marketplace_slug: "amazon",
      mode,
      sku: sku || null,
      source_snapshot: source,
      draft_values: draftValues,
      status,
      created_by: currentUser.user.id,
      updated_by: currentUser.user.id,
      updated_at: nowIso,
    })
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Entwurf konnte nicht gespeichert werden." }, { status: 500 });
  }
  return NextResponse.json({ item: data as DraftRow });
}

export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  if (!(await isOwnerUser(currentUser))) {
    return NextResponse.json({ error: "Nur Owner darf Produkt-Entwürfe verwalten." }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "id ist erforderlich." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("amazon_product_drafts").delete().eq("id", id);
  if (isMissingDraftsTable(error as { code?: string; message?: string } | undefined)) {
    return NextResponse.json(
      { error: "Tabelle 'amazon_product_drafts' fehlt. Bitte Migration ausführen." },
      { status: 503 }
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}
