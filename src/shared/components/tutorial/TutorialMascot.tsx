"use client";

import { cn } from "@/lib/utils";
import { SpaceCatMascot, SPACE_CAT_EMOTIONS, type SpaceCatEmotion } from "./SpaceCatMascot";

export { SPACE_CAT_EMOTIONS };

/** CSS-Hüllen-Animation um Cosmo (Editor + Overlay). */
export const MASCOT_CSS_ANIMATIONS = ["float", "bounce", "pulse", "sparkle", "wave"] as const;
export type MascotCssAnimation = (typeof MASCOT_CSS_ANIMATIONS)[number];

type TutorialMascotProps = {
  emotion: string;
  animation: string;
  isTalking?: boolean;
  /** SpaceCat SVG width in px; height follows viewBox ratio */
  cosmoSize?: number;
  className?: string;
};

const EMOTION_SET = new Set<string>(SPACE_CAT_EMOTIONS);

function mapToSpaceCatEmotion(emotion: string): SpaceCatEmotion {
  const e = emotion.trim().toLowerCase();
  if (EMOTION_SET.has(e)) return e as SpaceCatEmotion;
  return "greeting";
}

function animationClass(animation: string) {
  switch (animation) {
    case "bounce":
      return "animate-bounce";
    case "pulse":
      return "animate-pulse";
    case "sparkle":
      return "animate-ping";
    case "wave":
      return "animate-[wiggle_1.6s_ease-in-out_infinite]";
    default:
      return "animate-[float_2.6s_ease-in-out_infinite]";
  }
}

export function TutorialMascot({
  emotion,
  animation,
  isTalking,
  cosmoSize = 94,
  className,
}: TutorialMascotProps) {
  const box = Math.round(cosmoSize * 1.18);
  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center overflow-visible rounded-full border border-cyan-400/25 bg-slate-950/50 shadow-[0_0_24px_rgba(34,211,238,0.12)]",
          animationClass(animation)
        )}
        style={{ width: box, height: box }}
      >
        <SpaceCatMascot emotion={mapToSpaceCatEmotion(emotion)} isTalking={Boolean(isTalking)} size={cosmoSize} />
      </div>
      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        @keyframes wiggle {
          0%,
          100% {
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(2deg);
          }
          75% {
            transform: rotate(-2deg);
          }
        }
      `}</style>
    </div>
  );
}
