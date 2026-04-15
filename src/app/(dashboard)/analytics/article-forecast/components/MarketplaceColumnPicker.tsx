"use client";

import { ChevronDown, Store } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import { sentenceCaseColumnLabel } from "@/shared/lib/sentenceCaseColumnLabel";

export function MarketplaceColumnPicker({
  projectColumns,
  visibility,
  setVisibility,
}: {
  projectColumns: string[];
  visibility: Record<string, boolean>;
  setVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        nativeButton
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs",
          "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        )}
        aria-label={t("articleForecast.marketplacesMenuAria")}
      >
        <Store className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        <span>{t("articleForecast.marketplacesMenu")}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 min-w-[14rem] overflow-y-auto">
        {projectColumns.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            {t("articleForecast.marketplacesEmpty")}
          </div>
        ) : (
          <>
            {projectColumns.map((proj) => {
              const label = sentenceCaseColumnLabel(proj);
              const checked = visibility[proj] !== false;
              return (
                <DropdownMenuCheckboxItem
                  key={proj}
                  checked={checked}
                  onCheckedChange={(next) => {
                    setVisibility((prev) => ({ ...prev, [proj]: next === true }));
                  }}
                >
                  <span className="min-w-0 truncate" title={label}>
                    {label}
                  </span>
                </DropdownMenuCheckboxItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setVisibility((prev) => {
                  const next = { ...prev };
                  for (const p of projectColumns) next[p] = true;
                  return next;
                });
              }}
            >
              {t("articleForecast.marketplacesShowAll")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setVisibility((prev) => {
                  const next = { ...prev };
                  for (const p of projectColumns) next[p] = false;
                  return next;
                });
              }}
            >
              {t("articleForecast.marketplacesHideAll")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
