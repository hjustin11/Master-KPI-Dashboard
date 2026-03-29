"use client";

import { useTranslation } from "@/i18n/I18nProvider";

export default function AnalyticsPage() {
  const { t } = useTranslation();
  return <h2 className="text-xl font-semibold">{t("analyticsPage.title")}</h2>;
}
