"use client";

import { ChevronDown, Warehouse } from "lucide-react";
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

export function WarehouseColumnPicker({
  warehouseColumns,
  visibility,
  setVisibility,
}: {
  warehouseColumns: string[];
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
        aria-label={t("articleForecast.warehousesMenuAria")}
      >
        <Warehouse className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        <span>{t("articleForecast.warehousesMenu")}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 min-w-[14rem] overflow-y-auto">
        {warehouseColumns.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            {t("articleForecast.warehousesEmpty")}
          </div>
        ) : (
          <>
            {warehouseColumns.map((loc) => {
              const label = sentenceCaseColumnLabel(loc);
              const checked = visibility[loc] !== false;
              return (
                <DropdownMenuCheckboxItem
                  key={loc}
                  checked={checked}
                  onCheckedChange={(next) => {
                    setVisibility((prev) => ({ ...prev, [loc]: next === true }));
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
                  for (const w of warehouseColumns) next[w] = true;
                  return next;
                });
              }}
            >
              {t("articleForecast.warehousesShowAll")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setVisibility((prev) => {
                  const next = { ...prev };
                  for (const w of warehouseColumns) next[w] = false;
                  return next;
                });
              }}
            >
              {t("articleForecast.warehousesHideAll")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
