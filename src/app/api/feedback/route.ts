import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { isOwnerFromSources } from "@/shared/lib/roles";

const MAX_FEEDBACK_FILES = 8;
const MAX_FEEDBACK_FILE_BYTES = 5 * 1024 * 1024;

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

type FeedbackAttachmentMeta = {
  path: string;
  filename: string;
  content_type: string;
  size_bytes: number;
};

type FeatureRequestRow = {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string;
  title: string;
  message: string;
  status: "open" | "in_progress" | "done";
  owner_reply: string | null;
  page_path: string | null;
  attachments: FeedbackAttachmentMeta[];
};

function normalizePagePath(raw: string | null | undefined): string | null {
  const s = raw?.trim() ?? "";
  if (!s) return null;
  if (!s.startsWith("/")) return null;
  if (s.includes("..")) return null;
  if (s.length > 512) return null;
  return s;
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\]/g, "").replace(/\s+/g, "_").slice(0, 160);
  return base || "file";
}

type LegacyFeatureRequestRow = Omit<FeatureRequestRow, "page_path" | "attachments">;

function isLegacyFeatureRequestColumnError(err: { message?: string; code?: string } | null | undefined) {
  if (!err) return false;
  const msg = err.message ?? "";
  return /column|page_path|attachments|does not exist/i.test(msg) || err.code === "42703";
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
    }

    if (!(await isOwnerUser({ user, supabase }))) {
      return NextResponse.json({ error: "Nur Owner." }, { status: 403 });
    }

    const admin = createAdminClient();
    const full = await admin
      .from("feature_requests")
      .select(
        "id,created_at,user_id,user_email,title,message,status,owner_reply,page_path,attachments"
      )
      .order("created_at", { ascending: false });

    if (!full.error) {
      const rows = (full.data ?? []) as FeatureRequestRow[];
      return NextResponse.json({ items: rows });
    }

    const legacyMissingColumn = isLegacyFeatureRequestColumnError(full.error);

    if (!legacyMissingColumn) {
      return NextResponse.json(
        { error: "Vorschlaege konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    const legacy = await admin
      .from("feature_requests")
      .select("id,created_at,user_id,user_email,title,message,status,owner_reply")
      .order("created_at", { ascending: false });

    if (legacy.error) {
      return NextResponse.json(
        { error: "Vorschlaege konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    const rows: FeatureRequestRow[] = ((legacy.data ?? []) as LegacyFeatureRequestRow[]).map(
      (r) => ({
        ...r,
        page_path: null,
        attachments: [],
      })
    );
    return NextResponse.json({ items: rows });
  } catch (e) {
    console.error("[GET /api/feedback]", e);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
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

  const contentType = request.headers.get("content-type") ?? "";

  let title = "";
  let message = "";
  let pagePath: string | null = null;
  const files: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    title = String(form.get("title") ?? "").trim();
    message = String(form.get("message") ?? "").trim();
    pagePath = normalizePagePath(String(form.get("page_path") ?? ""));
    for (const entry of form.getAll("files")) {
      if (entry instanceof File && entry.size > 0) files.push(entry);
    }
  } else {
    const body = (await request.json()) as {
      title?: string;
      message?: string;
      page_path?: string;
    };
    title = body.title?.trim() ?? "";
    message = body.message?.trim() ?? "";
    pagePath = normalizePagePath(body.page_path);
  }

  if (!title || !message) {
    return NextResponse.json(
      { error: "title und message sind erforderlich." },
      { status: 400 }
    );
  }

  if (files.length > MAX_FEEDBACK_FILES) {
    return NextResponse.json(
      { error: `Maximal ${MAX_FEEDBACK_FILES} Dateien.` },
      { status: 400 }
    );
  }

  for (const f of files) {
    if (f.size > MAX_FEEDBACK_FILE_BYTES) {
      return NextResponse.json(
        { error: "Eine Datei ist zu groß (max. 5 MB pro Datei)." },
        { status: 400 }
      );
    }
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error("[POST /api/feedback] admin client", e);
    return NextResponse.json(
      { error: "Vorschlag konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }

  const baseRow = {
    user_id: user.id,
    user_email: user.email ?? "",
    title,
    message,
    status: "open" as const,
    owner_reply: null as null,
  };

  let inserted: FeatureRequestRow;
  let legacySchemaNoAttachments = false;

  const fullInsert = await admin
    .from("feature_requests")
    .insert({
      ...baseRow,
      page_path: pagePath,
      attachments: [],
    })
    .select(
      "id,created_at,user_id,user_email,title,message,status,owner_reply,page_path,attachments"
    )
    .maybeSingle();

  if (!fullInsert.error && fullInsert.data) {
    inserted = fullInsert.data as FeatureRequestRow;
  } else if (isLegacyFeatureRequestColumnError(fullInsert.error)) {
    const legacyInsert = await admin
      .from("feature_requests")
      .insert(baseRow)
      .select("id,created_at,user_id,user_email,title,message,status,owner_reply")
      .maybeSingle();

    if (legacyInsert.error || !legacyInsert.data) {
      console.error("[POST /api/feedback] legacy insert", legacyInsert.error);
      return NextResponse.json(
        { error: "Vorschlag konnte nicht gespeichert werden." },
        { status: 500 }
      );
    }
    legacySchemaNoAttachments = true;
    const leg = legacyInsert.data as LegacyFeatureRequestRow;
    inserted = { ...leg, page_path: null, attachments: [] };
  } else {
    console.error("[POST /api/feedback] insert", fullInsert.error);
    return NextResponse.json(
      { error: "Vorschlag konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }

  if (legacySchemaNoAttachments && files.length > 0) {
    console.warn(
      "[POST /api/feedback] feature_requests ohne page_path/attachments — Anhänge werden übersprungen."
    );
  }

  const requestId = inserted.id as string;
  const uploaded: FeedbackAttachmentMeta[] = [];

  for (let i = 0; i < files.length && !legacySchemaNoAttachments; i++) {
    const file = files[i];
    const safeName = `${Date.now()}-${i}-${sanitizeFilename(file.name)}`;
    const objectPath = `${user.id}/${requestId}/${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upError } = await admin.storage.from("feedback-attachments").upload(objectPath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upError) {
      await admin.from("feature_requests").delete().eq("id", requestId);
      return NextResponse.json({ error: "Datei-Upload fehlgeschlagen." }, { status: 500 });
    }
    uploaded.push({
      path: objectPath,
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      size_bytes: file.size,
    });
  }

  if (uploaded.length > 0) {
    const { data: updated, error: updateError } = await admin
      .from("feature_requests")
      .update({ attachments: uploaded })
      .eq("id", requestId)
      .select(
        "id,created_at,user_id,user_email,title,message,status,owner_reply,page_path,attachments"
      )
      .maybeSingle();
    if (updateError || !updated) {
      return NextResponse.json(
        { error: "Anhänge konnten nicht verknüpft werden." },
        { status: 500 }
      );
    }
    return NextResponse.json({ item: updated as FeatureRequestRow });
  }

  return NextResponse.json({
    item: inserted as FeatureRequestRow,
    ...(legacySchemaNoAttachments && files.length > 0 ? { attachments_skipped: true } : {}),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  if (!(await isOwnerUser({ user, supabase }))) {
    return NextResponse.json({ error: "Nur Owner." }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    status?: FeatureRequestRow["status"];
    ownerReply?: string;
  };
  const id = body.id?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "id ist erforderlich." }, { status: 400 });
  }

  const nextStatus =
    body.status === "open" || body.status === "in_progress" || body.status === "done"
      ? body.status
      : undefined;
  const ownerReply = typeof body.ownerReply === "string" ? body.ownerReply : undefined;

  if (!nextStatus && ownerReply === undefined) {
    return NextResponse.json({ error: "Keine Änderungen übergeben." }, { status: 400 });
  }

  const admin = createAdminClient();
  const updatePayload: Partial<Pick<FeatureRequestRow, "status" | "owner_reply">> = {};
  if (nextStatus) updatePayload.status = nextStatus;
  if (ownerReply !== undefined) updatePayload.owner_reply = ownerReply;

  const { error: updateOnlyError } = await admin
    .from("feature_requests")
    .update(updatePayload)
    .eq("id", id);

  if (updateOnlyError) {
    return NextResponse.json(
      { error: "Vorschlag konnte nicht aktualisiert werden." },
      { status: 500 }
    );
  }

  const fullRow = await admin
    .from("feature_requests")
    .select(
      "id,created_at,user_id,user_email,title,message,status,owner_reply,page_path,attachments"
    )
    .eq("id", id)
    .maybeSingle();

  if (!fullRow.error && fullRow.data) {
    return NextResponse.json({ item: fullRow.data as FeatureRequestRow });
  }

  const msg = fullRow.error?.message ?? "";
  const legacyMissingColumn =
    /column|page_path|attachments|does not exist/i.test(msg) || fullRow.error?.code === "42703";

  if (!legacyMissingColumn) {
    return NextResponse.json(
      { error: "Vorschlag konnte nicht aktualisiert werden." },
      { status: 500 }
    );
  }

  const leg = await admin
    .from("feature_requests")
    .select("id,created_at,user_id,user_email,title,message,status,owner_reply")
    .eq("id", id)
    .maybeSingle();

  if (leg.error || !leg.data) {
    return NextResponse.json(
      { error: "Vorschlag konnte nicht aktualisiert werden." },
      { status: 500 }
    );
  }

  const row = leg.data as LegacyFeatureRequestRow;
  return NextResponse.json({
    item: { ...row, page_path: null, attachments: [] } satisfies FeatureRequestRow,
  });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  if (!(await isOwnerUser({ user, supabase }))) {
    return NextResponse.json({ error: "Nur Owner." }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "id ist erforderlich." }, { status: 400 });
  }

  const admin = createAdminClient();

  let attachments: FeedbackAttachmentMeta[] = [];
  const full = await admin
    .from("feature_requests")
    .select("attachments")
    .eq("id", id)
    .maybeSingle();

  if (!full.error && full.data) {
    attachments = Array.isArray(full.data.attachments)
      ? (full.data.attachments as FeedbackAttachmentMeta[])
      : [];
  } else if (full.error) {
    const msg = full.error.message ?? "";
    const legacyMissingColumn =
      /column|attachments|does not exist/i.test(msg) || full.error.code === "42703";
    if (!legacyMissingColumn) {
      return NextResponse.json({ error: "Vorschlag konnte nicht gelöscht werden." }, { status: 500 });
    }
  }

  if (attachments.length > 0) {
    const paths = attachments.map((att) => att.path).filter(Boolean);
    if (paths.length > 0) {
      await admin.storage.from("feedback-attachments").remove(paths);
    }
  }

  const { error: deleteError } = await admin
    .from("feature_requests")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: "Vorschlag konnte nicht gelöscht werden." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id });
}
