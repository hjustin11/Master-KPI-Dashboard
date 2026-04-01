"use client";

import Link from "next/link";
import {
  BarChart3,
  Sparkles,
  LayoutGrid,
  LineChart,
  Megaphone,
  PackageSearch,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import { WelcomeHero } from "@/components/dashboard/welcome/WelcomeHero";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/i18n/I18nProvider";
import { DASHBOARD_PAGE_SHELL } from "@/shared/lib/dashboardUi";
import { useUser } from "@/shared/hooks/useUser";

type HomeTileKey =
  | "analyticsMarketplaces"
  | "analyticsForecast"
  | "updates"
  | "profile"
  | "xentralOrders"
  | "amazonOrders";

type HomeTile = {
  key: HomeTileKey;
  href: string;
  icon: typeof BarChart3;
  bar: string;
  iconSurface: string;
};

const HOME_TILES: HomeTile[] = [
  {
    key: "analyticsMarketplaces",
    href: "/analytics/marketplaces",
    icon: BarChart3,
    bar: "from-sky-500/18 via-sky-400/10 to-transparent",
    iconSurface:
      "border-sky-200/45 bg-gradient-to-br from-sky-400/8 to-sky-600/4 text-sky-800/72 dark:border-sky-800/30 dark:text-sky-300/80",
  },
  {
    key: "analyticsForecast",
    href: "/analytics/article-forecast",
    icon: LineChart,
    bar: "from-violet-500/18 via-violet-400/10 to-transparent",
    iconSurface:
      "border-violet-200/45 bg-gradient-to-br from-violet-400/8 to-violet-600/4 text-violet-900/70 dark:border-violet-800/30 dark:text-violet-300/80",
  },
  {
    key: "updates",
    href: "/updates",
    icon: Megaphone,
    bar: "from-amber-500/18 via-amber-400/10 to-transparent",
    iconSurface:
      "border-amber-200/45 bg-gradient-to-br from-amber-400/8 to-amber-600/4 text-amber-950/70 dark:border-amber-800/30 dark:text-amber-300/80",
  },
  {
    key: "profile",
    href: "/settings/profile",
    icon: UserRound,
    bar: "from-emerald-500/18 via-emerald-400/10 to-transparent",
    iconSurface:
      "border-emerald-200/45 bg-gradient-to-br from-emerald-400/8 to-emerald-600/4 text-emerald-950/70 dark:border-emerald-800/30 dark:text-emerald-300/80",
  },
  {
    key: "xentralOrders",
    href: "/xentral/orders",
    icon: PackageSearch,
    bar: "from-rose-500/18 via-rose-400/10 to-transparent",
    iconSurface:
      "border-rose-200/45 bg-gradient-to-br from-rose-400/8 to-rose-600/4 text-rose-950/70 dark:border-rose-800/30 dark:text-rose-300/80",
  },
  {
    key: "amazonOrders",
    href: "/amazon/orders",
    icon: ShoppingBag,
    bar: "from-orange-500/18 via-orange-400/10 to-transparent",
    iconSurface:
      "border-orange-200/45 bg-gradient-to-br from-orange-400/8 to-orange-600/4 text-orange-950/70 dark:border-orange-800/30 dark:text-orange-300/80",
  },
];

export default function DashboardHome() {
  const { t } = useTranslation();
  const user = useUser();
  const firstName = user.isLoading ? null : (user.fullName.split(" ")[0] || user.fullName);

  return (
    <div className={cn(DASHBOARD_PAGE_SHELL, "gap-8")}>
      {firstName ? (
        <WelcomeHero firstName={firstName} />
      ) : (
        <section className="rounded-2xl border border-border/70 bg-card/60 px-5 py-7 text-sm text-muted-foreground">
          {t("common.loading")}
        </section>
      )}

      <section className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm">
        <div className="space-y-1.5">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Onboarding
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{t("home.onboardingTitle")}</h2>
          <p className="text-sm text-foreground/80">{t("home.onboardingLead")}</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <div className="space-y-1.5">
            <Link
              href="https://drive.google.com/drive/folders/1h09BZ7mfMXb4Zh0ADhhZFu4RCC4qNzW_"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: "lg", variant: "default" }), "h-11 px-6 text-base")}
            >
              Onbaording-Tutorial
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="home-tiles-heading">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-gradient-to-br from-primary/10 to-accent/10 text-primary/80">
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2
              id="home-tiles-heading"
              className="text-base font-semibold tracking-tight text-foreground"
            >
              {t("home.quickLinksTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("home.quickLinksPlayfulHint")}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HOME_TILES.map((tile) => (
            <Card
              key={tile.key}
              className={cn(
                "group overflow-hidden border-border/50 bg-card/85",
                "transition-all duration-300",
                "motion-safe:hover:shadow-sm motion-safe:hover:shadow-primary/3",
              )}
            >
              <div
                className={cn(
                    "h-1 w-full bg-gradient-to-r opacity-70 transition-opacity group-hover:opacity-85",
                  tile.bar,
                )}
              />
              <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2 pt-4">
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    "motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.01]",
                    tile.iconSurface,
                  )}
                >
                  <tile.icon className="h-5 w-5" strokeWidth={1.85} />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-base leading-snug">
                    {t(`home.tiles.${tile.key}.title`)}
                  </CardTitle>
                  <CardDescription className="min-h-[2.75rem] text-pretty text-sm leading-relaxed">
                    {t(`home.tiles.${tile.key}.description`)}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardFooter className="pt-2">
                <Link
                  className={cn(
                    buttonVariants({ size: "sm", variant: "ghost" }),
                    "w-full font-medium text-muted-foreground",
                    "hover:bg-primary/5 hover:text-primary/80",
                  )}
                  href={tile.href}
                >
                  {t("home.ctaGo")}
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
