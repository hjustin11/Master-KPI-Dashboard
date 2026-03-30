import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";

export const TUTORIAL_TYPES = ["onboarding", "release_update"] as const;
export type TutorialType = (typeof TUTORIAL_TYPES)[number];

export const TUTORIAL_STATUS = ["draft", "published"] as const;
export type TutorialStatus = (typeof TUTORIAL_STATUS)[number];

export const TUTORIAL_ADVANCE_MODES = ["manual", "after_typewriter"] as const;
export type TutorialAdvanceMode = (typeof TUTORIAL_ADVANCE_MODES)[number];

export type TutorialScene = {
  id: string;
  tour_id: string;
  order_index: number;
  text: string;
  target_selector: string | null;
  mascot_emotion: string;
  mascot_animation: string;
  unlock_sidebar: boolean;
  advance_mode: TutorialAdvanceMode;
  estimated_ms: number;
};

export type TutorialTour = {
  id: string;
  tutorial_type: TutorialType;
  role: string;
  release_key: string | null;
  version: number;
  title: string;
  summary: string;
  enabled: boolean;
  required: boolean;
  status: TutorialStatus;
  updated_at: string;
  scenes?: TutorialScene[];
};

export type TutorialProgress = {
  id: string;
  user_id: string;
  tour_id: string;
  tutorial_type: TutorialType;
  role: string;
  release_key: string | null;
  current_scene_index: number;
  completed_at: string | null;
  dismissed_at: string | null;
  started_at: string;
  last_seen_at: string;
  updated_at: string;
};

export type AuthUserContext = {
  user: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  role: string;
};

export function isTutorialType(value: unknown): value is TutorialType {
  return typeof value === "string" && TUTORIAL_TYPES.includes(value as TutorialType);
}

export function isTutorialAdvanceMode(value: unknown): value is TutorialAdvanceMode {
  return typeof value === "string" && TUTORIAL_ADVANCE_MODES.includes(value as TutorialAdvanceMode);
}

export async function getCurrentUserContext(): Promise<AuthUserContext | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role =
    (profile?.role as string | undefined) ??
    (typeof user.app_metadata?.role === "string" ? user.app_metadata.role : undefined) ??
    (typeof user.user_metadata?.role === "string" ? user.user_metadata.role : undefined) ??
    "viewer";

  return {
    user,
    supabase,
    role,
  };
}

export async function isOwnerUser(context: AuthUserContext): Promise<boolean> {
  if (context.role === "owner") return true;
  const appRole = context.user.app_metadata?.role;
  const userRole = context.user.user_metadata?.role;
  return appRole === "owner" || userRole === "owner";
}

export async function canManageTutorials(context: AuthUserContext): Promise<boolean> {
  if (context.role === "owner" || context.role === "admin") return true;
  const appRole = context.user.app_metadata?.role;
  const userRole = context.user.user_metadata?.role;
  return appRole === "owner" || appRole === "admin" || userRole === "owner" || userRole === "admin";
}

