import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";

function roleIsOwner(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === "owner";
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
  if (roleIsOwner(profile?.role)) return true;
  const appRole = user.app_metadata?.role;
  const userRole = user.user_metadata?.role;
  return roleIsOwner(appRole) || roleIsOwner(userRole);
}

type AttachmentMeta = { path: string; filename: string; content_type: string; size_bytes: number };

export async function GET(request: Request) {
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
  const requestId = url.searchParams.get("requestId")?.trim() ?? "";
  const fileIndexRaw = url.searchParams.get("fileIndex") ?? "";
  const fileIndex = Number.parseInt(fileIndexRaw, 10);
  if (!requestId || !Number.isFinite(fileIndex) || fileIndex < 0) {
    return NextResponse.json({ error: "requestId und fileIndex sind erforderlich." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error: rowError } = await admin
    .from("feature_requests")
    .select("attachments")
    .eq("id", requestId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: "Eintrag nicht gefunden." }, { status: 404 });
  }

  const attachments = Array.isArray(row.attachments) ? (row.attachments as AttachmentMeta[]) : [];
  const meta = attachments[fileIndex];
  if (!meta?.path) {
    return NextResponse.json({ error: "Anhang nicht gefunden." }, { status: 404 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from("feedback-attachments")
    .createSignedUrl(meta.path, 3600);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Download-Link konnte nicht erstellt werden." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
