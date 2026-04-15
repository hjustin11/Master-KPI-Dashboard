"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_ARTICLE_FORECAST_RULES,
  sanitizeArticleForecastRulesByScope,
  type ArticleForecastRuleScope,
  type ArticleForecastRules,
  type ArticleForecastRulesByScope,
} from "@/shared/lib/articleForecastRules";
import {
  ARTICLE_FORECAST_RULE_SCOPE_KEY,
  readStoredRuleScope,
} from "@/shared/lib/article-forecast-utils";

export default function useArticleForecastRules(params: {
  hasMounted: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}): {
  ruleScope: ArticleForecastRuleScope;
  setRuleScope: React.Dispatch<React.SetStateAction<ArticleForecastRuleScope>>;
  rulesByScope: ArticleForecastRulesByScope;
  setRulesByScope: React.Dispatch<React.SetStateAction<ArticleForecastRulesByScope>>;
  activeRules: ArticleForecastRules;
  rulesLoading: boolean;
  rulesSaving: boolean;
  rulesError: string | null;
  rulesNotice: string | null;
  saveRules: (scope: ArticleForecastRuleScope, rules: ArticleForecastRules) => Promise<void>;
} {
  const { hasMounted, t } = params;

  const [ruleScope, setRuleScope] = useState<ArticleForecastRuleScope>("temporary");
  const [rulesByScope, setRulesByScope] = useState<ArticleForecastRulesByScope>({
    temporary: { ...DEFAULT_ARTICLE_FORECAST_RULES },
    fixed: { ...DEFAULT_ARTICLE_FORECAST_RULES },
  });
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [rulesNotice, setRulesNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!hasMounted) return;
    setRuleScope(readStoredRuleScope());
  }, [hasMounted]);

  useEffect(() => {
    if (!hasMounted) return;
    try {
      localStorage.setItem(ARTICLE_FORECAST_RULE_SCOPE_KEY, ruleScope);
    } catch {
      /* ignore */
    }
  }, [hasMounted, ruleScope]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setRulesLoading(true);
      setRulesError(null);
      try {
        const res = await fetch("/api/article-forecast/rules", { cache: "no-store" });
        const payload = (await res.json()) as {
          error?: string;
          rules?: Partial<ArticleForecastRulesByScope>;
        };
        if (!res.ok) {
          throw new Error(payload.error ?? t("articleForecast.rulesLoadError"));
        }
        if (!alive) return;
        setRulesByScope(sanitizeArticleForecastRulesByScope(payload.rules ?? null));
      } catch (e) {
        if (!alive) return;
        setRulesError(e instanceof Error ? e.message : t("articleForecast.rulesLoadError"));
      } finally {
        if (!alive) return;
        setRulesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  const saveRules = useCallback(
    async (scope: ArticleForecastRuleScope, rules: ArticleForecastRules) => {
      setRulesSaving(true);
      setRulesError(null);
      setRulesNotice(null);
      try {
        const res = await fetch("/api/article-forecast/rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, rules }),
        });
        const payload = (await res.json()) as { error?: string; rules?: ArticleForecastRules };
        if (!res.ok) throw new Error(payload.error ?? t("articleForecast.rulesSaveError"));
        setRulesNotice(t("articleForecast.rulesSaved"));
      } catch (e) {
        setRulesError(e instanceof Error ? e.message : t("articleForecast.rulesSaveError"));
      } finally {
        setRulesSaving(false);
      }
    },
    [t]
  );

  const activeRules = rulesByScope[ruleScope];

  return {
    ruleScope,
    setRuleScope,
    rulesByScope,
    setRulesByScope,
    activeRules,
    rulesLoading,
    rulesSaving,
    rulesError,
    rulesNotice,
    saveRules,
  };
}
