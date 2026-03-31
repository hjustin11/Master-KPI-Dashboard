import type { SidebarItemKey } from "@/shared/lib/access-control";

/** Rollen-Test: Zugriff pro Testrolle in Sidebar/Mobile-Nav setzen (nur Entwickler). */
export type NavAccessEditConfig = {
  targetRoleKey: string;
  isChecked: (key: SidebarItemKey) => boolean;
  toggle: (key: SidebarItemKey) => void;
};
