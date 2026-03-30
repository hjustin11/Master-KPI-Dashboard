"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import { useUser } from "@/shared/hooks/useUser";
import { DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";
import { TutorialOverlay, type RuntimeScene } from "@/shared/components/tutorial/TutorialOverlay";
import { MascotReferencePanel } from "@/shared/components/tutorial/MascotReferencePanel";
import {
  MASCOT_CSS_ANIMATIONS,
  SPACE_CAT_EMOTIONS,
  TutorialMascot,
} from "@/shared/components/tutorial/TutorialMascot";
import { useTranslation } from "@/i18n/I18nProvider";
import type { Role } from "@/shared/lib/invitations";
import { SIDEBAR_ITEM_CONFIG, type SidebarItemKey } from "@/shared/lib/access-control";
import { TUTORIAL_SIDEBAR_I18N_KEY } from "@/shared/lib/tutorialSceneHelpers";
import { cn } from "@/lib/utils";

type EditorTour = {
  id: string;
  tutorial_type: "onboarding" | "release_update";
  role: string;
  release_key: string | null;
  version: number;
  title: string;
  summary: string;
  enabled: boolean;
  required: boolean;
  status: "draft" | "published";
  scenes: RuntimeScene[];
};

const ROLE_OPTIONS: Role[] = ["owner", "admin", "manager", "analyst", "viewer"];

function normalizeLoadedScene(raw: RuntimeScene): RuntimeScene {
  return {
    ...raw,
    visible_sidebar_keys: raw.visible_sidebar_keys ?? null,
    highlight_extra_selectors: raw.highlight_extra_selectors ?? null,
    highlight_mode: raw.highlight_mode ?? "spotlight",
    highlight_padding_px: raw.highlight_padding_px ?? 6,
  };
}

const EMPTY_SCENE: RuntimeScene = {
  id: "new-scene",
  order_index: 0,
  text: "",
  target_selector: null,
  mascot_emotion: "greeting",
  mascot_animation: "float",
  unlock_sidebar: false,
  advance_mode: "manual",
  estimated_ms: 3800,
  visible_sidebar_keys: null,
  highlight_extra_selectors: null,
  highlight_mode: "spotlight",
  highlight_padding_px: 6,
};

export default function SettingsTutorialsPage() {
  const { t } = useTranslation();
  const user = useUser();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tours, setTours] = useState<EditorTour[]>([]);
  const [selectedTourId, setSelectedTourId] = useState<string>("");
  const [draft, setDraft] = useState<EditorTour | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEditTutorials = ["owner", "admin"].includes(user.roleKey?.toLowerCase() ?? "");

  const selectedTour = useMemo(
    () => tours.find((tour) => tour.id === selectedTourId) ?? null,
    [tours, selectedTourId]
  );

  const loadTours = useCallback(async () => {
    if (!canEditTutorials) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tutorials/editor", { cache: "no-store" });
      const payload = (await res.json()) as { tours?: EditorTour[]; error?: string };
      if (!res.ok) throw new Error(payload.error ?? t("tutorialEditor.loadError"));
      const nextTours = (payload.tours ?? []).map((tour) => ({
        ...tour,
        scenes: [...(tour.scenes ?? [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map((scene) => normalizeLoadedScene(scene as RuntimeScene)),
      }));
      setTours(nextTours);
      if (!selectedTourId && nextTours[0]) {
        setSelectedTourId(nextTours[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tutorialEditor.unknownError"));
    } finally {
      setLoading(false);
    }
  }, [canEditTutorials, selectedTourId, t]);

  useEffect(() => {
    void loadTours();
  }, [loadTours]);

  useEffect(() => {
    if (selectedTour) {
      const copy = JSON.parse(JSON.stringify(selectedTour)) as EditorTour;
      copy.scenes = copy.scenes.map((s) => normalizeLoadedScene(s));
      setDraft(copy);
    } else {
      setDraft(null);
    }
  }, [selectedTour]);

  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/tutorials/editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tour: {
            id: draft.id || undefined,
            tutorial_type: draft.tutorial_type,
            role: draft.role,
            release_key: draft.release_key,
            version: draft.version,
            title: draft.title,
            summary: draft.summary,
            enabled: draft.enabled,
            required: draft.required,
            status: draft.status,
          },
          scenes: draft.scenes.map((scene, index) => ({
            ...scene,
            order_index: index,
          })),
        }),
      });
      const payload = (await res.json()) as { tour?: EditorTour; error?: string };
      if (!res.ok || !payload.tour) throw new Error(payload.error ?? t("tutorialEditor.saveError"));
      setMessage(t("tutorialEditor.saved"));
      await loadTours();
      setSelectedTourId(payload.tour.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tutorialEditor.unknownError"));
    } finally {
      setSaving(false);
    }
  };

  const patchTour = async (patch: Partial<Pick<EditorTour, "status" | "enabled" | "required">>) => {
    if (!draft?.id) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/tutorials/editor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, ...patch }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? t("tutorialEditor.saveError"));
      setMessage(t("tutorialEditor.statusUpdated"));
      await loadTours();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tutorialEditor.unknownError"));
    } finally {
      setSaving(false);
    }
  };

  const sidebarKeyToggle = (sceneIndex: number, key: SidebarItemKey, checked: boolean) => {
    if (!draft) return;
    setDraft({
      ...draft,
      scenes: draft.scenes.map((s, idx) => {
        if (idx !== sceneIndex) return s;
        const base = s.visible_sidebar_keys ?? [];
        const set = new Set(base);
        if (checked) set.add(key);
        else set.delete(key);
        return { ...s, visible_sidebar_keys: Array.from(set) as string[] };
      }),
    });
  };

  if (!canEditTutorials && !user.isLoading) {
    return (
      <div className="space-y-2">
        <h1 className={DASHBOARD_PAGE_TITLE}>{t("tutorialEditor.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("tutorialEditor.accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className={DASHBOARD_PAGE_TITLE}>{t("tutorialEditor.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("tutorialEditor.pageLead")}</p>
      </div>

      <section className="space-y-3 rounded-xl border border-border/50 bg-card/80 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const created: EditorTour = {
                id: "",
                tutorial_type: "onboarding",
                role: "viewer",
                release_key: null,
                version: 1,
                title: "Neues Tutorial",
                summary: "Kurze Zusammenfassung",
                enabled: true,
                required: true,
                status: "draft",
                scenes: [{ ...EMPTY_SCENE }],
              };
              setDraft(created);
              setSelectedTourId("");
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs hover:bg-accent/40"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("tutorialEditor.newTour")}
          </button>
          <button
            type="button"
            onClick={() => void loadTours()}
            className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs hover:bg-accent/40"
          >
            {t("tutorialEditor.refresh")}
          </button>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="grid gap-3 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2 rounded-lg border border-border/50 bg-background/60 p-2">
            {tours.map((tour) => (
              <button
                key={tour.id}
                type="button"
                onClick={() => setSelectedTourId(tour.id)}
                className={cn(
                  "w-full rounded-md border px-2 py-2 text-left text-xs",
                  selectedTourId === tour.id
                    ? "border-primary/50 bg-primary/10"
                    : "border-border/40 bg-background hover:bg-accent/30"
                )}
              >
                <p className="font-medium">{tour.title}</p>
                <p className="text-muted-foreground">
                  {tour.tutorial_type === "onboarding"
                    ? t("tutorialEditor.typeOnboarding")
                    : t("tutorialEditor.typeRelease")}{" "}
                  · {t(`roles.${tour.role as Role}`)}
                </p>
                <p className="text-muted-foreground">
                  {tour.status === "published"
                    ? t("tutorialEditor.statusPublished")
                    : t("tutorialEditor.statusDraft")}{" "}
                  · v{tour.version}
                </p>
              </button>
            ))}
          </div>

          {draft ? (
            <div className="space-y-3 rounded-lg border border-border/50 bg-background/60 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span>{t("tutorialEditor.tourTitle")}</span>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span>{t("tutorialEditor.tourType")}</span>
                  <select
                    value={draft.tutorial_type}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        tutorial_type: e.target.value as EditorTour["tutorial_type"],
                        required: e.target.value === "onboarding",
                        release_key:
                          e.target.value === "release_update"
                            ? draft.release_key ?? "manual-release"
                            : null,
                      })
                    }
                    className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5"
                  >
                    <option value="onboarding">{t("tutorialEditor.typeOnboarding")}</option>
                    <option value="release_update">{t("tutorialEditor.typeRelease")}</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span>{t("tutorialEditor.role")}</span>
                  <select
                    value={draft.role}
                    onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                    className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {t(`roles.${role}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span>{t("tutorialEditor.version")}</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.version}
                    onChange={(e) => setDraft({ ...draft, version: Number(e.target.value) || 1 })}
                    className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5"
                  />
                </label>
              </div>

              {draft.tutorial_type === "release_update" ? (
                <label className="space-y-1 text-xs">
                  <span>{t("tutorialEditor.releaseKey")}</span>
                  <input
                    value={draft.release_key ?? ""}
                    onChange={(e) => setDraft({ ...draft, release_key: e.target.value })}
                    className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5"
                    placeholder={t("tutorialEditor.releaseKeyPlaceholder")}
                  />
                </label>
              ) : null}

              <label className="space-y-1 text-xs">
                <span>{t("tutorialEditor.summary")}</span>
                <input
                  value={draft.summary}
                  onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                  className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                  />
                  {t("tutorialEditor.enabled")}
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={draft.required}
                    onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                    disabled={draft.tutorial_type !== "onboarding"}
                  />
                  {t("tutorialEditor.requiredOnboarding")}
                </label>
              </div>

              <p className="text-[11px] leading-snug text-muted-foreground">{t("tutorialEditor.selectorHelp")}</p>

              <MascotReferencePanel />

              <div className="space-y-2">
                <p className="text-xs font-medium">{t("tutorialEditor.scenesHeading")}</p>
                {draft.scenes.map((scene, index) => {
                  const limitNav = scene.visible_sidebar_keys != null;
                  return (
                    <div key={`${scene.id}-${index}`} className="space-y-2 rounded-md border border-border/50 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium">{t("tutorialEditor.sceneN", { n: index + 1 })}</p>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              scenes: draft.scenes.filter((_, idx) => idx !== index),
                            })
                          }
                          className="rounded border border-border/60 px-2 py-1 text-[11px] hover:bg-accent/30"
                        >
                          {t("tutorialEditor.removeScene")}
                        </button>
                      </div>
                      <label className="block space-y-1 text-xs">
                        <span>{t("tutorialEditor.sceneText")}</span>
                        <textarea
                          value={scene.text}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              scenes: draft.scenes.map((s, idx) =>
                                idx === index ? { ...s, text: e.target.value } : s
                              ),
                            })
                          }
                          className="min-h-[70px] w-full rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs"
                        />
                      </label>
                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="space-y-1 text-xs">
                          <span>{t("tutorialEditor.targetSelector")}</span>
                          <input
                            value={scene.target_selector ?? ""}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                scenes: draft.scenes.map((s, idx) =>
                                  idx === index ? { ...s, target_selector: e.target.value || null } : s
                                ),
                              })
                            }
                            placeholder={t("tutorialEditor.targetSelectorPlaceholder")}
                            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs font-mono"
                          />
                        </label>
                        <label className="space-y-1 text-xs">
                          <span>{t("tutorialEditor.highlightPadding")}</span>
                          <input
                            type="number"
                            min={0}
                            max={64}
                            value={scene.highlight_padding_px ?? 6}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                scenes: draft.scenes.map((s, idx) =>
                                  idx === index
                                    ? { ...s, highlight_padding_px: Number(e.target.value) || 0 }
                                    : s
                                ),
                              })
                            }
                            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs"
                          />
                        </label>
                      </div>
                      <label className="block space-y-1 text-xs">
                        <span>{t("tutorialEditor.extraHighlights")}</span>
                        <textarea
                          value={scene.highlight_extra_selectors ?? ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              scenes: draft.scenes.map((s, idx) =>
                                idx === index
                                  ? { ...s, highlight_extra_selectors: e.target.value || null }
                                  : s
                              ),
                            })
                          }
                          placeholder={t("tutorialEditor.extraHighlightsPlaceholder")}
                          className="min-h-[52px] w-full rounded-md border border-border/50 bg-background px-2 py-1.5 font-mono text-[11px]"
                        />
                      </label>
                      <label className="block space-y-1 text-xs">
                        <span>{t("tutorialEditor.highlightMode")}</span>
                        <select
                          value={scene.highlight_mode ?? "spotlight"}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              scenes: draft.scenes.map((s, idx) =>
                                idx === index
                                  ? {
                                      ...s,
                                      highlight_mode: e.target.value as RuntimeScene["highlight_mode"],
                                    }
                                  : s
                              ),
                            })
                          }
                          className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5"
                        >
                          <option value="spotlight">{t("tutorialEditor.highlightSpotlight")}</option>
                          <option value="ring">{t("tutorialEditor.highlightRing")}</option>
                          <option value="ring_pulse">{t("tutorialEditor.highlightRingPulse")}</option>
                        </select>
                      </label>
                      <div className="rounded-md border border-border/40 bg-muted/10 p-2">
                        <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                          {t("tutorialEditor.mascotScenePreview")}
                        </p>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                            <label className="space-y-1 text-xs">
                              <span>{t("tutorialEditor.mascotEmotion")}</span>
                              <select
                                value={scene.mascot_emotion}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    scenes: draft.scenes.map((s, idx) =>
                                      idx === index ? { ...s, mascot_emotion: e.target.value } : s
                                    ),
                                  })
                                }
                                className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5 font-mono text-[11px]"
                              >
                                {!(SPACE_CAT_EMOTIONS as readonly string[]).includes(scene.mascot_emotion) &&
                                scene.mascot_emotion ? (
                                  <option value={scene.mascot_emotion}>{scene.mascot_emotion}</option>
                                ) : null}
                                {SPACE_CAT_EMOTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1 text-xs">
                              <span>{t("tutorialEditor.mascotAnimation")}</span>
                              <select
                                value={scene.mascot_animation}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    scenes: draft.scenes.map((s, idx) =>
                                      idx === index ? { ...s, mascot_animation: e.target.value } : s
                                    ),
                                  })
                                }
                                className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5 font-mono text-[11px]"
                              >
                                {!(MASCOT_CSS_ANIMATIONS as readonly string[]).includes(scene.mascot_animation) &&
                                scene.mascot_animation ? (
                                  <option value={scene.mascot_animation}>{scene.mascot_animation}</option>
                                ) : null}
                                {MASCOT_CSS_ANIMATIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div className="flex shrink-0 justify-center sm:justify-end">
                            <TutorialMascot
                              emotion={scene.mascot_emotion}
                              animation={scene.mascot_animation}
                              cosmoSize={64}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 border-t border-border/40 pt-2 text-xs">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={scene.unlock_sidebar}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                scenes: draft.scenes.map((s, idx) =>
                                  idx === index
                                    ? {
                                        ...s,
                                        unlock_sidebar: e.target.checked,
                                        visible_sidebar_keys: e.target.checked
                                          ? (s.visible_sidebar_keys ?? null)
                                          : null,
                                      }
                                    : s
                                ),
                              })
                            }
                          />
                          {t("tutorialEditor.unlockSidebar")}
                        </label>
                        <label
                          className={cn(
                            "inline-flex flex-col gap-1",
                            !scene.unlock_sidebar && "pointer-events-none opacity-50"
                          )}
                        >
                          <span className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={limitNav}
                              onChange={(e) => {
                                const on = e.target.checked;
                                setDraft({
                                  ...draft,
                                  scenes: draft.scenes.map((s, idx) =>
                                    idx === index
                                      ? {
                                          ...s,
                                          visible_sidebar_keys: on ? (s.visible_sidebar_keys ?? []) : null,
                                        }
                                      : s
                                  ),
                                });
                              }}
                              disabled={!scene.unlock_sidebar}
                            />
                            {t("tutorialEditor.limitSidebarLabel")}
                          </span>
                          <span className="pl-6 text-[10px] text-muted-foreground">
                            {t("tutorialEditor.limitSidebarHint")}
                          </span>
                          {limitNav && scene.unlock_sidebar ? (
                            <div className="ml-6 mt-1 grid max-h-36 grid-cols-2 gap-x-2 gap-y-1 overflow-y-auto rounded-md border border-border/40 p-2">
                              {SIDEBAR_ITEM_CONFIG.map(({ key }) => {
                                const checked = (scene.visible_sidebar_keys ?? []).includes(key);
                                return (
                                  <label key={key} className="flex items-center gap-1.5 text-[10px]">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => sidebarKeyToggle(index, key, e.target.checked)}
                                    />
                                    <span className="truncate">{t(TUTORIAL_SIDEBAR_I18N_KEY[key])}</span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : null}
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <label className="space-y-1">
                          <span>{t("tutorialEditor.advanceMode")}</span>
                          <select
                            value={scene.advance_mode}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                scenes: draft.scenes.map((s, idx) =>
                                  idx === index
                                    ? {
                                        ...s,
                                        advance_mode: e.target.value as RuntimeScene["advance_mode"],
                                      }
                                    : s
                                ),
                              })
                            }
                            className="mt-0.5 rounded-md border border-border/50 bg-background px-2 py-1.5"
                          >
                            <option value="manual">{t("tutorialEditor.advanceManual")}</option>
                            <option value="after_typewriter">{t("tutorialEditor.advanceTypewriter")}</option>
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span>{t("tutorialEditor.typingDurationMs")}</span>
                          <input
                            type="number"
                            min={500}
                            value={scene.estimated_ms}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                scenes: draft.scenes.map((s, idx) =>
                                  idx === index
                                    ? { ...s, estimated_ms: Number(e.target.value) || 500 }
                                    : s
                                ),
                              })
                            }
                            className="mt-0.5 w-full rounded-md border border-border/50 bg-background px-2 py-1.5"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      scenes: [
                        ...draft.scenes,
                        {
                          ...EMPTY_SCENE,
                          id: `new-${draft.scenes.length}`,
                          order_index: draft.scenes.length,
                        },
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-border/70 px-3 py-1.5 text-xs hover:bg-accent/30"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("tutorialEditor.addScene")}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {t("tutorialEditor.save")}
                </button>
                <button
                  type="button"
                  onClick={() => void patchTour({ status: draft.status === "published" ? "draft" : "published" })}
                  disabled={saving || !draft.id}
                  className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs hover:bg-accent/40 disabled:opacity-50"
                >
                  {draft.status === "published"
                    ? t("tutorialEditor.unpublish")
                    : t("tutorialEditor.publish")}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs hover:bg-accent/40"
                >
                  {t("tutorialEditor.livePreview")}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 bg-background/60 p-3 text-sm text-muted-foreground">
              {t("tutorialEditor.selectTourHint")}
            </div>
          )}
        </div>

        {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
        {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      </section>

      {previewOpen && draft?.scenes.length ? (
        <TutorialOverlay
          title={draft.title}
          summary={draft.summary}
          scenes={draft.scenes}
          currentIndex={previewIndex}
          required={draft.required}
          onNext={(next) =>
            setPreviewIndex(Math.min(Math.max(0, next), draft.scenes.length - 1))
          }
          onPrevious={() => setPreviewIndex((i) => Math.max(0, i - 1))}
          onComplete={() => {
            setPreviewOpen(false);
            setPreviewIndex(0);
          }}
          onDismiss={() => {
            setPreviewOpen(false);
            setPreviewIndex(0);
          }}
        />
      ) : null}
    </div>
  );
}
