"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n/I18nProvider";
import type {
  ArticleForecastRuleScope,
  ArticleForecastRules,
  ArticleForecastRulesByScope,
} from "@/shared/lib/articleForecastRules";
import { MarketplaceColumnPicker } from "./MarketplaceColumnPicker";
import { WarehouseColumnPicker } from "./WarehouseColumnPicker";
import { ArticleForecastRulesPopover } from "./ArticleForecastRulesPopover";

export function ArticleForecastToolbarBetween(props: {
  isLoading: boolean;
  hasLoadedOnce: boolean;
  projectColumns: string[];
  marketplaceColumnVisibility: Record<string, boolean>;
  setMarketplaceColumnVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  warehouseColumns: string[];
  warehouseColumnVisibility: Record<string, boolean>;
  setWarehouseColumnVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  ruleScope: ArticleForecastRuleScope;
  setRuleScope: (scope: ArticleForecastRuleScope) => void;
  activeRules: ArticleForecastRules;
  setRulesByScope: React.Dispatch<React.SetStateAction<ArticleForecastRulesByScope>>;
  saveRules: (scope: ArticleForecastRuleScope, rules: ArticleForecastRules) => Promise<void> | void;
  rulesSaving: boolean;
  rulesLoading: boolean;
  rulesError: string | null;
  rulesNotice: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.isLoading ? (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          {props.hasLoadedOnce ? t("articleForecast.refreshing") : t("articleForecast.loading")}
        </span>
      ) : null}
      <MarketplaceColumnPicker
        projectColumns={props.projectColumns}
        visibility={props.marketplaceColumnVisibility}
        setVisibility={props.setMarketplaceColumnVisibility}
      />
      <WarehouseColumnPicker
        warehouseColumns={props.warehouseColumns}
        visibility={props.warehouseColumnVisibility}
        setVisibility={props.setWarehouseColumnVisibility}
      />
      <ArticleForecastRulesPopover
        ruleScope={props.ruleScope}
        setRuleScope={props.setRuleScope}
        activeRules={props.activeRules}
        setRulesByScope={props.setRulesByScope}
        saveRules={props.saveRules}
        rulesSaving={props.rulesSaving}
        rulesLoading={props.rulesLoading}
        rulesError={props.rulesError}
        rulesNotice={props.rulesNotice}
      />
      <div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        <span>{t("articleForecast.legendLow")}</span>
        <span className="mx-0.5">·</span>
        <span>{t("articleForecast.legendCritical")}</span>
      </div>
    </div>
  );
}

export function ArticleForecastDateRangePicker({
  fromYmd,
  toYmd,
  onFromChange,
  onToChange,
}: {
  fromYmd: string;
  toYmd: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <span className="block text-xs font-medium text-muted-foreground">
          {t("articleForecast.from")}
        </span>
        <Input
          type="date"
          className="h-8 w-[140px] text-xs"
          value={fromYmd}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <span className="block text-xs font-medium text-muted-foreground">
          {t("articleForecast.to")}
        </span>
        <Input
          type="date"
          className="h-8 w-[140px] text-xs"
          value={toYmd}
          onChange={(e) => onToChange(e.target.value)}
        />
      </div>
    </div>
  );
}
