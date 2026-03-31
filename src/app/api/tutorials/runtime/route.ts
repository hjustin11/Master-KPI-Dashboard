import { NextResponse } from "next/server";
import {
  type TutorialProgress,
  type TutorialTour,
  getCurrentUserContext,
} from "@/shared/lib/tutorials";

function sortScenes(tour: TutorialTour): TutorialTour {
  if (!Array.isArray(tour.scenes)) return tour;
  return {
    ...tour,
    scenes: [...tour.scenes].sort((a, b) => a.order_index - b.order_index),
  };
}

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const { supabase, user, role } = context;

  const { data: onboardingTourDataPublished, error: onboardingTourPublishedError } = await supabase
    .from("tutorial_tours")
    .select(
      "id,tutorial_type,role,release_key,version,title,summary,enabled,required,status,updated_at,scenes:tutorial_scenes(*)"
    )
    .eq("tutorial_type", "onboarding")
    .eq("role", role)
    .eq("enabled", true)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (onboardingTourPublishedError) {
    return NextResponse.json({ error: onboardingTourPublishedError.message }, { status: 500 });
  }

  let onboardingTourData = onboardingTourDataPublished;
  if (!onboardingTourData) {
    // Fallback: Falls (noch) keine veröffentlichte Onboarding-Tour existiert,
    // nutze die neueste aktive Tour für diese Rolle.
    const { data: onboardingFallbackData, error: onboardingFallbackError } = await supabase
      .from("tutorial_tours")
      .select(
        "id,tutorial_type,role,release_key,version,title,summary,enabled,required,status,updated_at,scenes:tutorial_scenes(*)"
      )
      .eq("tutorial_type", "onboarding")
      .eq("role", role)
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (onboardingFallbackError) {
      return NextResponse.json({ error: onboardingFallbackError.message }, { status: 500 });
    }
    onboardingTourData = onboardingFallbackData;
  }

  const { data: updateToursData, error: updateToursError } = await supabase
    .from("tutorial_tours")
    .select(
      "id,tutorial_type,role,release_key,version,title,summary,enabled,required,status,updated_at,scenes:tutorial_scenes(*)"
    )
    .eq("tutorial_type", "release_update")
    .eq("role", role)
    .eq("enabled", true)
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  if (updateToursError) {
    return NextResponse.json({ error: updateToursError.message }, { status: 500 });
  }

  const tourIds = [
    ...(onboardingTourData?.id ? [onboardingTourData.id] : []),
    ...((updateToursData ?? []).map((tour) => tour.id) as string[]),
  ];

  let progressByTour = new Map<string, TutorialProgress>();
  if (tourIds.length > 0) {
    const { data: progressRows, error: progressError } = await supabase
      .from("tutorial_user_progress")
      .select("*")
      .eq("user_id", user.id)
      .in("tour_id", tourIds);
    if (progressError) {
      return NextResponse.json({ error: progressError.message }, { status: 500 });
    }
    progressByTour = new Map(
      ((progressRows ?? []) as TutorialProgress[]).map((row) => [row.tour_id, row])
    );
  }

  const onboardingTour = onboardingTourData
    ? sortScenes(onboardingTourData as TutorialTour)
    : null;
  const onboardingProgress = onboardingTour
    ? progressByTour.get(onboardingTour.id) ?? null
    : null;

  const mustCompleteOnboarding =
    Boolean(onboardingTour?.required) && !onboardingProgress?.completed_at;

  const updateTours = ((updateToursData ?? []) as TutorialTour[])
    .map(sortScenes)
    .map((tour) => {
      const progress = progressByTour.get(tour.id) ?? null;
      return {
        tour,
        progress,
        completed: Boolean(progress?.completed_at),
        dismissed: Boolean(progress?.dismissed_at),
      };
    });

  return NextResponse.json({
    role,
    onboarding: {
      tour: onboardingTour,
      progress: onboardingProgress,
      mustComplete: mustCompleteOnboarding,
    },
    updates: updateTours,
  });
}

