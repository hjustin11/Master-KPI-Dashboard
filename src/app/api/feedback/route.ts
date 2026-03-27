import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";

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
  if (profile?.role === "owner") return true;
  const appRole = user.app_metadata?.role;
  const userRole = user.user_metadata?.role;
  return appRole === "owner" || userRole === "owner";
}

type FeatureRequestRow = {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string;
  title: string;
  message: string;
  status: "open" | "in_progress" | "done";
  owner_reply: string | null;
};

export async function GET() {
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
  const { data, error: listError } = await admin
    .from("feature_requests")
    .select("id,created_at,user_id,user_email,title,message,status,owner_reply")
    .order("created_at", { ascending: false });

  if (listError) {
    return NextResponse.json(
      { error: "Vorschlaege konnten nicht geladen werden." },
      { status: 500 }
    );
  }

  return NextResponse.json({ items: (data ?? []) as FeatureRequestRow[] });
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

  const body = (await request.json()) as { title?: string; message?: string };
  const title = body.title?.trim() ?? "";
  const message = body.message?.trim() ?? "";

  if (!title || !message) {
    return NextResponse.json(
      { error: "title und message sind erforderlich." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error: insertError } = await admin
    .from("feature_requests")
    .insert({
      user_id: user.id,
      user_email: user.email ?? "",
      title,
      message,
      status: "open",
      owner_reply: null,
    })
    .select("id,created_at,user_id,user_email,title,message,status,owner_reply")
    .maybeSingle();

  if (insertError || !data) {
    return NextResponse.json(
      { error: "Vorschlag konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }

  return NextResponse.json({ item: data as FeatureRequestRow });
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

  const { data, error: updateError } = await admin
    .from("feature_requests")
    .update(updatePayload)
    .eq("id", id)
    .select("id,created_at,user_id,user_email,title,message,status,owner_reply")
    .maybeSingle();

  if (updateError || !data) {
    return NextResponse.json(
      { error: "Vorschlag konnte nicht aktualisiert werden." },
      { status: 500 }
    );
  }

  return NextResponse.json({ item: data as FeatureRequestRow });
}

