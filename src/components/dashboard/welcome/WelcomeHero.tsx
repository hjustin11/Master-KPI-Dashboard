"use client";

import { Sparkles } from "lucide-react";
import { useTranslation } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

export function WelcomeHero({ firstName }: { firstName: string }) {
  const { t } = useTranslation();

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/80",
        "bg-gradient-to-br from-primary/[0.035] via-accent/[0.02] to-background",
        "px-5 py-7 shadow-sm shadow-primary/2 sm:px-7 sm:py-8",
      )}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full bg-primary/6 blur-3xl motion-safe:animate-[home-float-slow_14s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-accent/7 blur-3xl motion-safe:animate-[home-float-slow_18s_ease-in-out_infinite_2s]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-1/4 top-4 h-16 w-16 rounded-full bg-chart-4/5 blur-2xl motion-safe:animate-[home-float-slow_10s_ease-in-out_infinite_0.5s]"
        aria-hidden
      />

      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
            "border border-primary/10 bg-primary/5 text-primary/65",
            "motion-safe:animate-[home-bob_3s_ease-in-out_infinite]",
          )}
          aria-hidden
        >
          <Sparkles className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="bg-gradient-to-r from-primary/75 to-accent/60 bg-clip-text text-transparent">
              {t("home.welcomeWord")}
            </span>
            <span className="text-foreground">{t("home.welcomeNamePart", { name: firstName })}</span>
          </h1>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[0.95rem]">
            {t("home.playfulTagline")}
          </p>
        </div>
      </div>
    </section>
  );
}
