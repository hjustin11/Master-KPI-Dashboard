"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import type { AddressDisplayState } from "@/shared/lib/xentral-orders-utils";

/** Status-Kreis: Ring mit leichtem Fill — Rot bei Fehler kräftiger gefüllt. */
export function AddressStatusDisc({ state, title }: { state: AddressDisplayState; title: string }) {
  const cls =
    state === "invalid"
      ? "border-red-700 bg-red-600 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
      : state === "edited"
        ? "border-amber-600 bg-amber-400/35 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.35)]"
        : "border-emerald-700 bg-emerald-500/30 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)]";

  return (
    <span
      className={cn(
        "box-border inline-block aspect-square size-3 shrink-0 rounded-full border-2 align-middle",
        cls
      )}
      title={title}
      role="img"
      aria-label={title}
    />
  );
}

export function AddressValidationCell({
  display,
  issues,
}: {
  display: AddressDisplayState;
  issues: string[];
}) {
  const { t } = useTranslation();
  const title =
    display === "ok"
      ? t("xentralOrders.addressOkTitle")
      : display === "edited"
        ? t("xentralOrders.addressEditedTitle")
        : issues.length > 0
          ? t("xentralOrders.addressErrorWithIssues", { issues: issues.join(" · ") })
          : t("xentralOrders.addressErrorGeneric");
  return <AddressStatusDisc state={display} title={title} />;
}

/**
 * Gleiche Rasterhöhe in allen Adress-Spalten: oben feste Zeile (Bisher / Ladehinweis / unsichtbarer Platzhalter), unten Input.
 */
export function AddressEditStack({
  beforeFrom,
  showGeocodeLoading,
  alignCenter,
  children,
}: {
  beforeFrom?: string | null;
  showGeocodeLoading?: boolean;
  alignCenter?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const hasBefore = beforeFrom != null;
  const beforeLine = (() => {
    const s = (beforeFrom ?? "").trim();
    if (s === "" || s === "—") return t("xentralOrders.emptyBeforeValue");
    return s;
  })();
  return (
    <div
      className={cn(
        "flex w-full flex-col justify-center gap-1.5",
        alignCenter && "items-center"
      )}
    >
      <div
        className={cn(
          "flex min-h-[1.375rem] w-full shrink-0 items-center",
          alignCenter ? "justify-center text-center" : "justify-start"
        )}
      >
        {showGeocodeLoading ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Loader2 className="size-3 shrink-0 animate-spin opacity-65" aria-hidden />
            {t("xentralOrders.geocodeSyncing")}
          </span>
        ) : hasBefore ? (
          <span
            className={cn(
              "max-w-full truncate text-[11px] leading-tight text-muted-foreground line-through decoration-destructive/45 [text-decoration-thickness:1px] dark:decoration-destructive/50",
              alignCenter && "text-center"
            )}
            title={t("xentralOrders.beforeWasTitle", { value: beforeLine })}
          >
            {beforeLine}
          </span>
        ) : (
          <span className="select-none text-[11px] leading-[1.375rem] text-transparent" aria-hidden>
            ·
          </span>
        )}
      </div>
      <div className={cn("w-full min-w-0", alignCenter && "flex justify-center")}>{children}</div>
    </div>
  );
}
