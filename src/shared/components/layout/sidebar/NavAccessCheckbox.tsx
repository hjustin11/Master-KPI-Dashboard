"use client";

import { cn } from "@/lib/utils";
import type { SidebarItemKey } from "@/shared/lib/access-control";
import type { NavAccessEditConfig } from "@/shared/lib/nav-access-edit";

export function NavAccessCheckbox({
  itemKey,
  accessEdit,
  compact,
}: {
  itemKey: SidebarItemKey;
  accessEdit?: NavAccessEditConfig;
  compact?: boolean;
}) {
  if (!accessEdit) return null;
  const disabled = accessEdit.targetRoleKey === "owner";
  return (
    <input
      type="checkbox"
      className={cn(
        "shrink-0 accent-primary",
        compact ? "h-3 w-3" : "h-3.5 w-3.5"
      )}
      checked={accessEdit.isChecked(itemKey)}
      disabled={disabled}
      onChange={() => accessEdit.toggle(itemKey)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Sidebar sichtbar"
    />
  );
}
