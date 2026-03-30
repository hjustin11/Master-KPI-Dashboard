"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Loader2, X } from "lucide-react";
import { TutorialMascot } from "@/shared/components/tutorial/TutorialMascot";
import { useTranslation } from "@/i18n/I18nProvider";
import {
  collectHighlightSelectors,
  sanitizeHighlightMode,
  type TutorialHighlightMode,
} from "@/shared/lib/tutorialSceneHelpers";
import { cn } from "@/lib/utils";

export type RuntimeScene = {
  id: string;
  order_index: number;
  text: string;
  target_selector: string | null;
  mascot_emotion: string;
  mascot_animation: string;
  unlock_sidebar: boolean;
  advance_mode: "manual" | "after_typewriter";
  estimated_ms: number;
  visible_sidebar_keys?: string[] | null;
  highlight_extra_selectors?: string | null;
  highlight_mode?: string | null;
  highlight_padding_px?: number | null;
};

type Rect = { top: number; left: number; width: number; height: number };

const AUTO_ADVANCE_STORAGE = "tutorial-auto-advance";

type TutorialOverlayProps = {
  title: string;
  summary: string;
  scenes: RuntimeScene[];
  currentIndex: number;
  required: boolean;
  loading?: boolean;
  onNext: (nextIndex: number) => void;
  onPrevious?: () => void;
  onComplete: () => void;
  onDismiss: () => void;
};

export function TutorialOverlay({
  title,
  summary,
  scenes,
  currentIndex,
  required,
  loading = false,
  onNext,
  onPrevious,
  onComplete,
  onDismiss,
}: TutorialOverlayProps) {
  const { t } = useTranslation();
  const [typedLength, setTypedLength] = useState(0);
  const [tourDetailsOpen, setTourDetailsOpen] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const scene = scenes[currentIndex] ?? null;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        if (window.localStorage.getItem(AUTO_ADVANCE_STORAGE) === "1") {
          setAutoAdvance(true);
        }
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAutoAdvancePersist = (next: boolean) => {
    setAutoAdvance(next);
    try {
      window.localStorage.setItem(AUTO_ADVANCE_STORAGE, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const highlightMode: TutorialHighlightMode = sanitizeHighlightMode(scene?.highlight_mode);
  const highlightPadding = Number.isFinite(scene?.highlight_padding_px)
    ? Math.min(64, Math.max(0, Number(scene?.highlight_padding_px)))
    : 6;

  const highlightSelectors = useMemo(
    () =>
      scene
        ? collectHighlightSelectors({
            primary: scene.target_selector,
            extraRaw: scene.highlight_extra_selectors ?? null,
          })
        : [],
    [scene]
  );

  const typedText = useMemo(() => {
    if (!scene) return "";
    return scene.text.slice(0, typedLength);
  }, [scene, typedLength]);

  useEffect(() => {
    queueMicrotask(() => {
      setTypedLength(0);
    });
  }, [scene?.id]);

  useEffect(() => {
    if (!scene?.text) return;
    const total = scene.text.length;
    if (typedLength >= total) return;
    const timeoutMs = Math.max(10, Math.floor((scene.estimated_ms ?? 3200) / Math.max(1, total)));
    const id = window.setTimeout(() => {
      setTypedLength((prev) => Math.min(total, prev + 1));
    }, timeoutMs);
    return () => window.clearTimeout(id);
  }, [scene, typedLength]);

  const [rects, setRects] = useState<Rect[]>([]);
  useEffect(() => {
    if (!scene || highlightSelectors.length === 0) {
      queueMicrotask(() => {
        setRects([]);
      });
      return;
    }
    const recalc = () => {
      const next: Rect[] = [];
      for (const sel of highlightSelectors) {
        const element = document.querySelector(sel);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        next.push({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      }
      setRects(next);
    };
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [scene, highlightSelectors]);

  useEffect(() => {
    const s = scenes[currentIndex] ?? null;
    if (!s) return;
    const finished = typedLength >= s.text.length;
    const last = currentIndex >= scenes.length - 1;
    if (!autoAdvance || !finished || last || loading) return;
    const id = window.setTimeout(() => {
      onNext(currentIndex + 1);
    }, 520);
    return () => window.clearTimeout(id);
  }, [autoAdvance, typedLength, scenes, currentIndex, loading, onNext]);

  if (!scene) return null;
  const finishedTyping = typedLength >= scene.text.length;
  const canAutoAdvance = scene.advance_mode === "after_typewriter" && finishedTyping;
  const isLast = currentIndex >= scenes.length - 1;
  const atFirstStep = currentIndex <= 0;

  const primaryRect = rects[0] ?? null;
  const showSpotlightCutout = highlightMode === "spotlight" && primaryRect != null;
  const ringRects =
    highlightMode === "spotlight" ? rects.slice(1) : highlightMode === "ring" || highlightMode === "ring_pulse" ? rects : [];

  return (
    <div className="pointer-events-auto fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" />

      {showSpotlightCutout ? (
        <div
          className="pointer-events-none absolute z-[121] rounded-xl border-2 border-cyan-400/70 shadow-[0_0_0_9999px_rgba(3,7,18,0.55)] transition-all"
          style={{
            top: `${Math.max(6, primaryRect.top - highlightPadding)}px`,
            left: `${Math.max(6, primaryRect.left - highlightPadding)}px`,
            width: `${primaryRect.width + highlightPadding * 2}px`,
            height: `${primaryRect.height + highlightPadding * 2}px`,
          }}
        />
      ) : null}

      {ringRects.map((rect, index) => (
        <div
          key={`ring-${index}-${rect.top}-${rect.left}`}
          className={cn(
            "pointer-events-none absolute z-[122] rounded-xl border-2 border-cyan-400/75 bg-transparent transition-all",
            highlightMode === "ring_pulse" ? "animate-pulse" : ""
          )}
          style={{
            top: `${Math.max(4, rect.top - highlightPadding)}px`,
            left: `${Math.max(4, rect.left - highlightPadding)}px`,
            width: `${rect.width + highlightPadding * 2}px`,
            height: `${rect.height + highlightPadding * 2}px`,
          }}
        />
      ))}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[123] flex justify-center px-3 pb-5 pt-8 sm:px-5 sm:pb-8">
        <div className="pointer-events-auto relative w-full max-w-2xl">
          <div className="pointer-events-none absolute bottom-1 right-0 z-30 w-[min(46%,10.5rem)] sm:w-44 md:right-2 md:w-48">
            <div className="pointer-events-auto flex justify-end drop-shadow-[0_12px_28px_rgba(0,0,0,0.55)]">
              <TutorialMascot
                emotion={scene.mascot_emotion}
                animation={scene.mascot_animation}
                isTalking={scene.text.length > 0 && !finishedTyping}
                cosmoSize={112}
              />
            </div>
          </div>

          <div
            className={cn(
              "relative z-20 overflow-hidden rounded-[1.65rem] border border-cyan-400/35",
              "bg-[linear-gradient(165deg,rgba(11,17,32,0.98)_0%,rgba(5,8,20,0.99)_50%,rgba(4,7,16,1)_100%)]",
              "shadow-[0_0_0_1px_rgba(125,249,255,0.06),0_28px_56px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)]",
              "pl-4 pr-4 pb-4 pt-3.5 sm:pl-6 sm:pr-7 sm:pb-5 sm:pt-4",
              "min-h-[200px] pr-[min(38%,7.5rem)] sm:pr-40"
            )}
          >
            <header className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
              <div className="min-w-0 pt-0.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300/95 sm:text-xs">
                  ★ {t("tutorialOverlay.step", { current: currentIndex + 1, total: scenes.length })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTourDetailsOpen((o) => !o)}
                  aria-expanded={tourDetailsOpen}
                  aria-label={t("tutorialOverlay.tourDetailsToggle")}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-slate-950/80 text-white/75 transition hover:border-cyan-400/25 hover:bg-slate-900/90 hover:text-cyan-200"
                >
                  <ChevronDown
                    className={cn("h-4 w-4 transition-transform duration-200", tourDetailsOpen ? "rotate-180" : "")}
                  />
                </button>
                {!required ? (
                  <button
                    type="button"
                    onClick={onDismiss}
                    aria-label={t("tutorialOverlay.close")}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-slate-950/80 text-white/75 transition hover:border-rose-400/30 hover:bg-slate-900/90 hover:text-rose-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </header>

            {tourDetailsOpen ? (
              <div className="mb-3 space-y-1 rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2.5 sm:mb-4">
                <p className="text-sm font-semibold text-white/95">{title}</p>
                {summary ? <p className="text-xs leading-relaxed text-white/55">{summary}</p> : null}
              </div>
            ) : null}

            <div className="min-h-[4.5rem] text-[15px] leading-relaxed text-white/[0.94] sm:min-h-[5.5rem] sm:text-base">
              {typedText}
              {!finishedTyping ? (
                <span className="ml-0.5 inline-block h-[1.1em] w-px animate-pulse bg-cyan-400 align-text-bottom" />
              ) : null}
            </div>

            <footer className="mt-5 flex flex-col gap-4 sm:mt-6">
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex cursor-pointer items-center gap-2.5 text-xs text-white/55">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoAdvance}
                    onClick={() => setAutoAdvancePersist(!autoAdvance)}
                    className={cn(
                      "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
                      autoAdvance
                        ? "border-cyan-400/50 bg-cyan-500/25"
                        : "border-white/10 bg-slate-950/80"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-1 top-1 h-5 w-5 rounded-full bg-white/90 shadow transition-transform",
                        autoAdvance ? "translate-x-5 bg-cyan-200" : "translate-x-0"
                      )}
                    />
                  </button>
                  <span className="font-medium uppercase tracking-wide text-white/70">{t("tutorialOverlay.auto")}</span>
                </label>

                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:flex-1">
                  {scenes.map((_, i) => (
                    <button
                      key={_.id}
                      type="button"
                      onClick={() => onNext(i)}
                      disabled={loading}
                      aria-label={t("tutorialOverlay.goToStep", { n: i + 1 })}
                      aria-current={i === currentIndex ? "step" : undefined}
                      className={cn(
                        "transition-all disabled:opacity-40",
                        i === currentIndex
                          ? "h-2 w-8 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.45)]"
                          : "h-2 w-2 rounded-full bg-white/15 hover:bg-white/30"
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-white/5 pt-4">
                {onPrevious && !atFirstStep ? (
                  <button
                    type="button"
                    onClick={onPrevious}
                    disabled={loading}
                    aria-label={t("tutorialOverlay.back")}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/80 transition hover:border-cyan-400/25 hover:bg-white/[0.1] hover:text-cyan-100 disabled:opacity-40"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                ) : (
                  <span className="h-11 w-11 shrink-0 sm:w-0" aria-hidden />
                )}
                {isLast ? (
                  <button
                    type="button"
                    onClick={onComplete}
                    disabled={!finishedTyping || loading}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(14,165,233,0.35)] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-initial sm:min-w-[11rem]"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t("tutorialOverlay.finish")}
                    <ArrowRight className="h-4 w-4 opacity-90" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNext(currentIndex + 1)}
                    disabled={loading || (!finishedTyping && !canAutoAdvance)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(14,165,233,0.35)] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-initial sm:min-w-[11rem]"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t("tutorialOverlay.next")}
                    <ArrowRight className="h-4 w-4 opacity-90" />
                  </button>
                )}
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
