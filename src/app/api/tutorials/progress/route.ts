import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/shared/lib/tutorials";

type ProgressAction = "start" | "next" | "complete" | "dismiss" | "restart";

function isProgressAction(value: unknown): value is ProgressAction {
  return (
    value === "start" ||
    value === "next" ||
    value === "complete" ||
    value === "dismiss" ||
    value === "restart"
  );
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body." }, { status: 400 });
  }

  const payload = (body ?? {}) as {
    action?: ProgressAction;
    tourId?: string;
    sceneIndex?: number;
  };
  if (!isProgressAction(payload.action)) {
    return NextResponse.json({ error: "Ungueltige Aktion." }, { status: 400 });
  }
  if (!payload.tourId || typeof payload.tourId !== "string") {
    return NextResponse.json({ error: "tourId fehlt." }, { status: 400 });
  }

  const { supabase, user, role } = context;

  const { data: tour, error: tourError } = await supabase
    .from("tutorial_tours")
    .select("id,tutorial_type,role,release_key,required,enabled,status")
    .eq("id", payload.tourId)
    .eq("role", role)
    .eq("enabled", true)
    .eq("status", "published")
    .maybeSingle();

  if (tourError) {
    return NextResponse.json({ error: tourError.message }, { status: 500 });
  }
  if (!tour) {
    return NextResponse.json({ error: "Tour nicht gefunden." }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const sceneIndex = Number.isFinite(payload.sceneIndex) ? Math.max(0, payload.sceneIndex ?? 0) : 0;

  const { data: existing, error: existingError } = await supabase
    .from("tutorial_user_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("tour_id", payload.tourId)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const nextRecord: Record<string, unknown> = {
    user_id: user.id,
    tour_id: payload.tourId,
    tutorial_type: tour.tutorial_type,
    role: role,
    release_key: tour.release_key,
    current_scene_index: existing?.current_scene_index ?? 0,
    started_at: existing?.started_at ?? nowIso,
    last_seen_at: nowIso,
    updated_at: nowIso,
    completed_at: existing?.completed_at ?? null,
    dismissed_at: existing?.dismissed_at ?? null,
  };

  switch (payload.action) {
    case "start":
      nextRecord.current_scene_index = existing?.current_scene_index ?? 0;
      nextRecord.dismissed_at = null;
      break;
    case "next":
      nextRecord.current_scene_index = sceneIndex;
      break;
    case "complete":
      nextRecord.current_scene_index = sceneIndex;
      nextRecord.completed_at = nowIso;
      nextRecord.dismissed_at = null;
      break;
    case "dismiss":
      if (tour.tutorial_type === "onboarding" && tour.required) {
        return NextResponse.json(
          { error: "Dieses Onboarding ist verpflichtend und kann nicht geschlossen werden." },
          { status: 409 }
        );
      }
      nextRecord.dismissed_at = nowIso;
      break;
    case "restart":
      nextRecord.current_scene_index = 0;
      nextRecord.completed_at = null;
      nextRecord.dismissed_at = null;
      nextRecord.started_at = nowIso;
      break;
  }

  const { data: saved, error: saveError } = await supabase
    .from("tutorial_user_progress")
    .upsert(nextRecord, { onConflict: "user_id,tour_id" })
    .select("*")
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, progress: saved });
}

