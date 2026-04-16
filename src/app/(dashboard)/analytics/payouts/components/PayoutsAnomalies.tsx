"use client";

import { useMemo } from "react";
import type { PayoutOverview, PayoutAnomaly } from "@/shared/lib/payouts/payoutTypes";
import { detectAnomalies } from "@/shared/lib/payouts/anomalyDetection";
import { useTranslation } from "@/i18n/I18nProvider";

const ICON: Record<string, string> = {
  critical: "🚨",
  warning: "⚠️",
  info: "✅",
};

const BG: Record<string, string> = {
  critical: "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800",
  warning: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
  info: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
};

function AnomalyLine({ anomaly }: { anomaly: PayoutAnomaly }) {
  const { t } = useTranslation();
  const message = t(anomaly.messageKey, anomaly.messageArgs);
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${BG[anomaly.severity] ?? ""}`}>
      <span className="mt-0.5 text-base">{ICON[anomaly.severity] ?? "ℹ️"}</span>
      <span>{message}</span>
      {anomaly.marketplace && (
        <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
          {anomaly.marketplace}
        </span>
      )}
    </div>
  );
}

export function PayoutsAnomalies({
  overview,
  loading,
}: {
  overview: PayoutOverview | null;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const anomalies = useMemo(() => {
    if (!overview) return [];
    return detectAnomalies(overview);
  }, [overview]);

  if (loading || !overview) return null;
  if (anomalies.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("payouts.anomalies.title")}</h3>
      {anomalies.map((a, idx) => (
        <AnomalyLine key={idx} anomaly={a} />
      ))}
    </div>
  );
}
