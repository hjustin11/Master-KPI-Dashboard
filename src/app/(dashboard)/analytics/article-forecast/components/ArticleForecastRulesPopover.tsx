"use client";

import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "@/i18n/I18nProvider";
import type {
  ArticleForecastRuleScope,
  ArticleForecastRules,
  ArticleForecastRulesByScope,
} from "@/shared/lib/articleForecastRules";

export function ArticleForecastRulesPopover({
  ruleScope,
  setRuleScope,
  activeRules,
  setRulesByScope,
  saveRules,
  rulesSaving,
  rulesLoading,
  rulesError,
  rulesNotice,
}: {
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
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" aria-hidden />
            {t("articleForecast.rulesMenu")}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-[22rem]">
        <PopoverHeader>
          <PopoverTitle>{t("articleForecast.rulesMenu")}</PopoverTitle>
          <PopoverDescription>{t("articleForecast.rulesDescription")}</PopoverDescription>
        </PopoverHeader>

        <div className="mt-1 flex items-center gap-1">
          <Button
            type="button"
            variant={ruleScope === "temporary" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setRuleScope("temporary")}
          >
            {t("articleForecast.scopeTemporary")}
          </Button>
          <Button
            type="button"
            variant={ruleScope === "fixed" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setRuleScope("fixed")}
          >
            {t("articleForecast.scopeFixed")}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={t("articleForecast.ruleProjectionDays")}
            value={activeRules.projectionDays}
            min={1}
            max={366}
            onChange={(v) =>
              setRulesByScope((prev) => ({
                ...prev,
                [ruleScope]: { ...prev[ruleScope], projectionDays: v },
              }))
            }
          />
          <NumberField
            label={t("articleForecast.ruleSalesWindowDays")}
            value={activeRules.salesWindowDays}
            min={1}
            max={366}
            onChange={(v) =>
              setRulesByScope((prev) => ({
                ...prev,
                [ruleScope]: { ...prev[ruleScope], salesWindowDays: v },
              }))
            }
          />
          <NumberField
            label={t("articleForecast.ruleLowStock")}
            value={activeRules.lowStockThreshold}
            onChange={(v) =>
              setRulesByScope((prev) => ({
                ...prev,
                [ruleScope]: { ...prev[ruleScope], lowStockThreshold: v },
              }))
            }
          />
          <NumberField
            label={t("articleForecast.ruleCriticalStock")}
            value={activeRules.criticalStockThreshold}
            onChange={(v) =>
              setRulesByScope((prev) => ({
                ...prev,
                [ruleScope]: { ...prev[ruleScope], criticalStockThreshold: v },
              }))
            }
          />
        </div>

        <Button
          type="button"
          variant={activeRules.includeInboundProcurement ? "default" : "outline"}
          size="sm"
          className="h-8 w-full text-xs"
          onClick={() =>
            setRulesByScope((prev) => ({
              ...prev,
              [ruleScope]: {
                ...prev[ruleScope],
                includeInboundProcurement: !prev[ruleScope].includeInboundProcurement,
              },
            }))
          }
        >
          {activeRules.includeInboundProcurement
            ? t("articleForecast.ruleInboundOn")
            : t("articleForecast.ruleInboundOff")}
        </Button>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={rulesSaving || rulesLoading}
            onClick={() => void saveRules(ruleScope, activeRules)}
          >
            {rulesSaving ? t("articleForecast.rulesSaving") : t("articleForecast.rulesSave")}
          </Button>
          {rulesLoading ? (
            <span className="text-[11px] text-muted-foreground">
              {t("articleForecast.rulesLoading")}
            </span>
          ) : null}
        </div>

        {rulesError ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-700">
            {rulesError}
          </div>
        ) : null}
        {rulesNotice ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-800">
            {rulesNotice}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        className="h-8 text-xs"
        value={String(value)}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(Number.isFinite(v) ? v : min ?? 0);
        }}
      />
    </div>
  );
}
