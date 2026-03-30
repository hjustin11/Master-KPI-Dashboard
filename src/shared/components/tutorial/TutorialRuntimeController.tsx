"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TutorialOverlay, type RuntimeScene } from "@/shared/components/tutorial/TutorialOverlay";
import { useUser } from "@/shared/hooks/useUser";

type RuntimeTour = {
  id: string;
  tutorial_type: "onboarding" | "release_update";
  role: string;
  release_key: string | null;
  title: string;
  summary: string;
  required: boolean;
  scenes: RuntimeScene[];
};

type RuntimeProgress = {
  current_scene_index: number;
  completed_at: string | null;
  dismissed_at: string | null;
};

type RuntimeResponse = {
  onboarding: {
    tour: RuntimeTour | null;
    progress: RuntimeProgress | null;
    mustComplete: boolean;
  };
  updates: Array<{
    tour: RuntimeTour;
    progress: RuntimeProgress | null;
    completed: boolean;
    dismissed: boolean;
  }>;
};

type TutorialRuntimeControllerProps = {
  onStateChange?: (state: {
    locked: boolean;
    sidebarVisible: boolean;
    /** null = alle erlaubten Menüpunkte (kein Tutorial-Filter) */
    visibleSidebarKeys: string[] | null;
  }) => void;
};

const START_EVENT = "dashboard-tutorial-start";

export function TutorialRuntimeController({ onStateChange }: TutorialRuntimeControllerProps) {
  const user = useUser();
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [activeTour, setActiveTour] = useState<RuntimeTour | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progressLoading, setProgressLoading] = useState(false);

  const loadRuntime = useCallback(async () => {
    if (!user.id) return;
    const res = await fetch("/api/tutorials/runtime", { cache: "no-store" });
    const payload = (await res.json()) as RuntimeResponse & { error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Tutorial-Runtime konnte nicht geladen werden.");
    setRuntime(payload);

    if (payload.onboarding.mustComplete && payload.onboarding.tour) {
      setActiveTour(payload.onboarding.tour);
      setCurrentIndex(payload.onboarding.progress?.current_scene_index ?? 0);
    }
  }, [user.id]);

  useEffect(() => {
    if (user.isLoading || !user.id) return;
    void loadRuntime().catch((error) => {
      console.warn("[Tutorial] Runtime-Load fehlgeschlagen", error);
    });
  }, [user.id, user.isLoading, loadRuntime]);

  const persistProgress = useCallback(
    async (action: "start" | "next" | "complete" | "dismiss" | "restart", tourId: string, sceneIndex: number) => {
      setProgressLoading(true);
      try {
        await fetch("/api/tutorials/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            tourId,
            sceneIndex,
          }),
        });
      } finally {
        setProgressLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const startByEvent = (event: Event) => {
      const custom = event as CustomEvent<{ tourId?: string }>;
      const tourId = custom.detail?.tourId;
      if (!tourId) return;
      const match = runtime?.updates.find((item) => item.tour.id === tourId)?.tour;
      if (!match) return;
      setActiveTour(match);
      setCurrentIndex(runtime?.updates.find((item) => item.tour.id === tourId)?.progress?.current_scene_index ?? 0);
      void persistProgress("start", match.id, 0);
    };
    window.addEventListener(START_EVENT, startByEvent as EventListener);
    return () => window.removeEventListener(START_EVENT, startByEvent as EventListener);
  }, [persistProgress, runtime]);

  const activeScene = useMemo(
    () => (activeTour?.scenes ?? [])[Math.min(currentIndex, Math.max((activeTour?.scenes.length ?? 1) - 1, 0))] ?? null,
    [activeTour, currentIndex]
  );

  const sidebarVisible = activeTour ? Boolean(activeScene?.unlock_sidebar) : true;
  const locked = Boolean(activeTour?.required);

  const visibleSidebarKeys: string[] | null = (() => {
    if (!activeTour || !activeScene?.unlock_sidebar) return null;
    const raw = activeScene.visible_sidebar_keys;
    if (raw === undefined || raw === null) return null;
    return Array.isArray(raw) ? raw : null;
  })();

  useEffect(() => {
    onStateChange?.({
      locked,
      sidebarVisible,
      visibleSidebarKeys: sidebarVisible ? visibleSidebarKeys : null,
    });
  }, [locked, onStateChange, sidebarVisible, visibleSidebarKeys]);

  if (!activeTour || !activeTour.scenes?.length) return null;

  return (
    <TutorialOverlay
      title={activeTour.title}
      summary={activeTour.summary}
      scenes={activeTour.scenes}
      currentIndex={currentIndex}
      required={activeTour.required}
      loading={progressLoading}
      onNext={(nextIndex) => {
        const clamped = Math.min(Math.max(0, nextIndex), activeTour.scenes.length - 1);
        setCurrentIndex(clamped);
        void persistProgress("next", activeTour.id, clamped);
      }}
      onPrevious={() => {
        const prev = Math.max(0, currentIndex - 1);
        setCurrentIndex(prev);
        void persistProgress("next", activeTour.id, prev);
      }}
      onComplete={() => {
        const sceneIndex = activeTour.scenes.length - 1;
        void persistProgress("complete", activeTour.id, sceneIndex);
        setActiveTour(null);
        setCurrentIndex(0);
        void loadRuntime();
      }}
      onDismiss={() => {
        void persistProgress("dismiss", activeTour.id, currentIndex);
        setActiveTour(null);
      }}
    />
  );
}

export function dispatchStartTutorialEvent(tourId: string) {
  if (!tourId) return;
  window.dispatchEvent(new CustomEvent(START_EVENT, { detail: { tourId } }));
}

