import { NextResponse } from "next/server";
import {
  TUTORIAL_ADVANCE_MODES,
  TUTORIAL_TYPES,
  canManageTutorials,
  getCurrentUserContext,
} from "@/shared/lib/tutorials";
import {
  sanitizeHighlightMode,
  sanitizeVisibleSidebarKeys,
} from "@/shared/lib/tutorialSceneHelpers";

type EditorSceneInput = {
  id?: string;
  order_index?: number;
  text?: string;
  target_selector?: string | null;
  mascot_emotion?: string;
  mascot_animation?: string;
  unlock_sidebar?: boolean;
  advance_mode?: string;
  estimated_ms?: number;
  visible_sidebar_keys?: string[] | null;
  highlight_extra_selectors?: string | null;
  highlight_mode?: string | null;
  highlight_padding_px?: number | null;
};

type EditorTourInput = {
  id?: string;
  tutorial_type?: string;
  role?: string;
  release_key?: string | null;
  version?: number;
  title?: string;
  summary?: string;
  enabled?: boolean;
  required?: boolean;
  status?: "draft" | "published";
};

function normalizeScene(scene: EditorSceneInput, fallbackIndex: number) {
  const advanceMode = TUTORIAL_ADVANCE_MODES.includes(scene.advance_mode as (typeof TUTORIAL_ADVANCE_MODES)[number])
    ? scene.advance_mode
    : "manual";
  const sidebarKeys = Boolean(scene.unlock_sidebar)
    ? sanitizeVisibleSidebarKeys(scene.visible_sidebar_keys)
    : null;
  const extraRaw =
    typeof scene.highlight_extra_selectors === "string" && scene.highlight_extra_selectors.trim().length > 0
      ? scene.highlight_extra_selectors.trim()
      : null;
  const highlightMode = sanitizeHighlightMode(scene.highlight_mode);
  const highlightPadding =
    scene.highlight_padding_px != null && Number.isFinite(Number(scene.highlight_padding_px))
      ? Math.min(64, Math.max(0, Number(scene.highlight_padding_px)))
      : null;

  return {
    order_index: Number.isFinite(scene.order_index) ? Math.max(0, scene.order_index ?? 0) : fallbackIndex,
    text: (scene.text ?? "").trim(),
    target_selector:
      typeof scene.target_selector === "string" && scene.target_selector.trim().length > 0
        ? scene.target_selector.trim()
        : null,
    mascot_emotion: (scene.mascot_emotion ?? "greeting").trim() || "greeting",
    mascot_animation: (scene.mascot_animation ?? "float").trim() || "float",
    unlock_sidebar: Boolean(scene.unlock_sidebar),
    advance_mode: advanceMode,
    estimated_ms: Number.isFinite(scene.estimated_ms)
      ? Math.max(500, Number(scene.estimated_ms))
      : 3800,
    visible_sidebar_keys: sidebarKeys,
    highlight_extra_selectors: extraRaw,
    highlight_mode: highlightMode,
    highlight_padding_px: highlightPadding,
  };
}

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!(await canManageTutorials(context))) {
    return NextResponse.json({ error: "Nur Team-Leads oder Owner duerfen den Tutorial-Editor nutzen." }, { status: 403 });
  }

  const url = new URL(request.url);
  const typeFilter = url.searchParams.get("type");
  const roleFilter = url.searchParams.get("role");

  let query = context.supabase
    .from("tutorial_tours")
    .select(
      "id,tutorial_type,role,release_key,version,title,summary,enabled,required,status,updated_at,created_at,scenes:tutorial_scenes(*)"
    )
    .order("updated_at", { ascending: false });
  if (typeFilter && TUTORIAL_TYPES.includes(typeFilter as (typeof TUTORIAL_TYPES)[number])) {
    query = query.eq("tutorial_type", typeFilter);
  }
  if (roleFilter) {
    query = query.eq("role", roleFilter);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tours: data ?? [] });
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!(await canManageTutorials(context))) {
    return NextResponse.json({ error: "Nur Team-Leads oder Owner duerfen den Tutorial-Editor nutzen." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body." }, { status: 400 });
  }

  const payload = (body ?? {}) as {
    tour?: EditorTourInput;
    scenes?: EditorSceneInput[];
  };
  const tour = payload.tour;
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  if (!tour) {
    return NextResponse.json({ error: "tour fehlt." }, { status: 400 });
  }
  if (!tour.tutorial_type || !TUTORIAL_TYPES.includes(tour.tutorial_type as (typeof TUTORIAL_TYPES)[number])) {
    return NextResponse.json({ error: "Ungueltiger Tutorial-Typ." }, { status: 400 });
  }
  if (!tour.role || typeof tour.role !== "string") {
    return NextResponse.json({ error: "Rolle fehlt." }, { status: 400 });
  }
  if (!tour.title?.trim()) {
    return NextResponse.json({ error: "Titel fehlt." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const tourPayload = {
    id: tour.id,
    tutorial_type: tour.tutorial_type,
    role: tour.role,
    release_key:
      tour.tutorial_type === "release_update" ? (tour.release_key?.trim() || "manual-release") : null,
    version: Number.isFinite(tour.version) ? Math.max(1, Number(tour.version)) : 1,
    title: tour.title.trim(),
    summary: (tour.summary ?? "").trim(),
    enabled: tour.enabled ?? true,
    required: tour.tutorial_type === "onboarding" ? Boolean(tour.required ?? true) : false,
    status: tour.status ?? "draft",
    created_by: context.user.id,
    updated_at: nowIso,
  };

  const { data: savedTour, error: tourSaveError } = await context.supabase
    .from("tutorial_tours")
    .upsert(tourPayload)
    .select("id,tutorial_type,role,release_key,version,title,summary,enabled,required,status,updated_at")
    .single();
  if (tourSaveError || !savedTour) {
    return NextResponse.json({ error: tourSaveError?.message ?? "Tour konnte nicht gespeichert werden." }, { status: 500 });
  }

  const normalizedScenes = scenes
    .map((scene, index) => normalizeScene(scene, index))
    .filter((scene) => scene.text.length > 0)
    .sort((a, b) => a.order_index - b.order_index)
    .map((scene, index) => ({
      ...scene,
      tour_id: savedTour.id,
      order_index: index,
    }));

  const { error: deleteScenesError } = await context.supabase
    .from("tutorial_scenes")
    .delete()
    .eq("tour_id", savedTour.id);
  if (deleteScenesError) {
    return NextResponse.json({ error: deleteScenesError.message }, { status: 500 });
  }

  if (normalizedScenes.length > 0) {
    const { error: insertScenesError } = await context.supabase
      .from("tutorial_scenes")
      .insert(normalizedScenes);
    if (insertScenesError) {
      return NextResponse.json({ error: insertScenesError.message }, { status: 500 });
    }
  }

  const { data: fullTour, error: readBackError } = await context.supabase
    .from("tutorial_tours")
    .select(
      "id,tutorial_type,role,release_key,version,title,summary,enabled,required,status,updated_at,scenes:tutorial_scenes(*)"
    )
    .eq("id", savedTour.id)
    .single();
  if (readBackError) {
    return NextResponse.json({ error: readBackError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tour: fullTour });
}

export async function PATCH(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  if (!(await canManageTutorials(context))) {
    return NextResponse.json({ error: "Nur Team-Leads oder Owner duerfen den Tutorial-Editor nutzen." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body." }, { status: 400 });
  }
  const payload = (body ?? {}) as {
    id?: string;
    status?: "draft" | "published";
    enabled?: boolean;
    required?: boolean;
  };
  if (!payload.id) {
    return NextResponse.json({ error: "id fehlt." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (payload.status === "draft" || payload.status === "published") patch.status = payload.status;
  if (typeof payload.enabled === "boolean") patch.enabled = payload.enabled;
  if (typeof payload.required === "boolean") patch.required = payload.required;

  const { data, error } = await context.supabase
    .from("tutorial_tours")
    .update(patch)
    .eq("id", payload.id)
    .select("id,status,enabled,required,updated_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tour: data });
}

