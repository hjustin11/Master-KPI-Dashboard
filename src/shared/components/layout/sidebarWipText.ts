import type { SidebarItemKey } from "@/shared/lib/access-control";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function wipLockedHintForItem(itemKey: SidebarItemKey, t: Translate): string {
  if (itemKey === "myArea") return t("nav.myAreaLockedHint");
  if (itemKey === "advertising") return t("nav.advertisingLockedHint");
  return t("nav.sidebarWipLockedHint");
}

export function wipDevTooltipForItem(itemKey: SidebarItemKey, t: Translate): string {
  if (itemKey === "myArea") return t("nav.myAreaWipTooltip");
  if (itemKey === "advertising") return t("nav.advertisingWipTooltip");
  return t("nav.sidebarWipDevTooltip");
}

export type { Translate };
