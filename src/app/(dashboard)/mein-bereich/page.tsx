"use client";

import { Construction } from "lucide-react";
import { DASHBOARD_PAGE_SHELL, DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useTranslation } from "@/i18n/I18nProvider";

export default function MyAreaPage() {
  const { t } = useTranslation();
  const { isAdvertisingDeveloper } = usePermissions();

  if (!isAdvertisingDeveloper) {
    return (
      <div className={DASHBOARD_PAGE_SHELL}>
        <section className="rounded-xl border border-border/60 bg-card/80 p-6">
          <h1 className={DASHBOARD_PAGE_TITLE}>{t("nav.myArea")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("nav.myAreaLockedHint")}</p>
        </section>
      </div>
    );
  }

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <section className="rounded-xl border border-border/60 bg-card/80 p-6">
        <div className="flex items-center gap-2">
          <Construction className="h-5 w-5 text-amber-600" aria-hidden />
          <h1 className={DASHBOARD_PAGE_TITLE}>{t("nav.myArea")}</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t("nav.myAreaWipTooltip")}</p>
      </section>
    </div>
  );
}
