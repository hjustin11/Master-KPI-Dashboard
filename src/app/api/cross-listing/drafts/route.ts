import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  CROSS_LISTING_TARGET_SLUGS,
  type CrossListingDraftRow,
  type CrossListingDraftValues,
  type CrossListingSourceMap,
  type CrossListingTargetSlug,
} from "@/shared/lib/crossListing/crossListingDraftTypes";

export const dynamic = "force-dynamic";

const ALLOWED_TARGETS = new Set<string>(CROSS_LISTING_TARGET_SLUGS);
const ALLOWED_SOURCES = new Set<string>([...CROSS_LISTING_TARGET_SLUGS, "xentral"]);
const ALLOWED_STATUS = new Set<CrossListingDraftRow["status"]>([
  "draft",
  "generating",
  "ready",
  "reviewing",
  "uploading",
  "uploaded",
  "failed",
]);

type DbRow = {
  id: string;
  sku: string;
  ean: string | null;
  source_marketplace_slug: string;
  target_marketplace_slug: string;
  source_data: unknown;
  generated_listing: unknown;
  user_edits: unknown;
  status: CrossListingDraftRow["status"];
  error_message: string | null;
  uploaded_at: string | null;
  marketplace_listing_id: string | null;
  created_at: string;
  updated_at: string;
};

function rowToDraft(row: DbRow): CrossListingDraftRow {
  return {
    id: row.id,
    sku: row.sku,
    ean: row.ean,
    sourceMarketplaceSlug: row.source_marketplace_slug,
    targetMarketplaceSlug: row.target_marketplace_slug,
    sourceData: (row.source_data as CrossListingSourceMap) ?? {},
    generatedListing: (row.generated_listing as CrossListingDraftValues | null) ?? null,
    userEdits: (row.user_edits as CrossListingDraftValues | null) ?? null,
    status: row.status,
    errorMessage: row.error_message,
    uploadedAt: row.uploaded_at,
    marketplaceListingId: row.marketplace_listing_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isDraftValues(v: unknown): v is CrossListingDraftValues {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.title === "string" &&
    typeof o.description === "string" &&
    Array.isArray(o.bullets) &&
    Array.isArray(o.images) &&
    typeof o.priceEur === "string" &&
    typeof o.stockQty === "string" &&
    typeof o.ean === "string" &&
    !!o.attributes &&
    typeof o.attributes === "object"
  );
}

async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { user: null, response: NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 }) };
  return { user, response: null as null };
}

function adminOr503() {
  try {
    return { admin: createAdminClient(), response: null as null };
  } catch {
    return {
      admin: null,
      response: NextResponse.json(
        { error: "Server-Konfiguration unvollständig (Supabase Service Role)." },
        { status: 503 }
      ),
    };
  }
}

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { admin, response: adminErr } = adminOr503();
  if (!admin) return adminErr;

  const url = new URL(request.url);
  const skuFilter = url.searchParams.get("sku")?.trim() ?? "";
  const targetFilter = url.searchParams.get("target")?.trim() ?? "";
  const skusParam = url.searchParams.get("skus")?.trim() ?? "";

  let query = admin
    .from("cross_listing_drafts")
    .select(
      "id,sku,ean,source_marketplace_slug,target_marketplace_slug,source_data,generated_listing,user_edits,status,error_message,uploaded_at,marketplace_listing_id,created_at,updated_at"
    )
    .order("updated_at", { ascending: false });

  if (skuFilter) query = query.eq("sku", skuFilter);
  if (targetFilter) query = query.eq("target_marketplace_slug", targetFilter);
  if (skusParam) {
    const skus = skusParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (skus.length > 0) query = query.in("sku", skus);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const drafts = (data ?? []).map((r) => rowToDraft(r as DbRow));
  return NextResponse.json({ drafts });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { admin, response: adminErr } = adminOr503();
  if (!admin) return adminErr;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });

  const sku = typeof body.sku === "string" ? body.sku.trim() : "";
  const ean = typeof body.ean === "string" ? body.ean.trim() || null : null;
  const target = typeof body.target_marketplace_slug === "string" ? body.target_marketplace_slug.trim() : "";
  const source = typeof body.source_marketplace_slug === "string" ? body.source_marketplace_slug.trim() : "";
  const sourceData = body.source_data;
  const generatedListing = body.generated_listing;
  const userEdits = body.user_edits;
  const statusRaw = typeof body.status === "string" ? body.status : "ready";

  if (!sku) return NextResponse.json({ error: "sku ist erforderlich." }, { status: 400 });
  if (!ALLOWED_TARGETS.has(target)) {
    return NextResponse.json({ error: "Ungültiger target_marketplace_slug." }, { status: 400 });
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return NextResponse.json({ error: "Ungültiger source_marketplace_slug." }, { status: 400 });
  }
  if (!sourceData || typeof sourceData !== "object") {
    return NextResponse.json({ error: "source_data erforderlich." }, { status: 400 });
  }
  if (generatedListing !== undefined && generatedListing !== null && !isDraftValues(generatedListing)) {
    return NextResponse.json({ error: "generated_listing hat ungültige Struktur." }, { status: 400 });
  }
  if (userEdits !== undefined && userEdits !== null && !isDraftValues(userEdits)) {
    return NextResponse.json({ error: "user_edits hat ungültige Struktur." }, { status: 400 });
  }
  const status = ALLOWED_STATUS.has(statusRaw as CrossListingDraftRow["status"])
    ? (statusRaw as CrossListingDraftRow["status"])
    : "ready";

  const { data, error } = await admin
    .from("cross_listing_drafts")
    .insert({
      sku,
      ean,
      source_marketplace_slug: source,
      target_marketplace_slug: target as CrossListingTargetSlug,
      source_data: sourceData,
      generated_listing: generatedListing ?? null,
      user_edits: userEdits ?? null,
      status,
      created_by: user.id,
      updated_by: user.id,
    })
    .select(
      "id,sku,ean,source_marketplace_slug,target_marketplace_slug,source_data,generated_listing,user_edits,status,error_message,uploaded_at,marketplace_listing_id,created_at,updated_at"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draft: rowToDraft(data as DbRow) });
}

export async function PUT(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { admin, response: adminErr } = adminOr503();
  if (!admin) return adminErr;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id ist erforderlich." }, { status: 400 });

  const patch: Record<string, unknown> = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (body.user_edits !== undefined) {
    if (body.user_edits !== null && !isDraftValues(body.user_edits)) {
      return NextResponse.json({ error: "user_edits hat ungültige Struktur." }, { status: 400 });
    }
    patch.user_edits = body.user_edits;
  }
  if (typeof body.status === "string" && ALLOWED_STATUS.has(body.status as CrossListingDraftRow["status"])) {
    patch.status = body.status;
  }
  if (typeof body.error_message === "string" || body.error_message === null) {
    patch.error_message = body.error_message;
  }

  const { data, error } = await admin
    .from("cross_listing_drafts")
    .update(patch)
    .eq("id", id)
    .select(
      "id,sku,ean,source_marketplace_slug,target_marketplace_slug,source_data,generated_listing,user_edits,status,error_message,uploaded_at,marketplace_listing_id,created_at,updated_at"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draft: rowToDraft(data as DbRow) });
}
