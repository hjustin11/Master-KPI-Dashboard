import { redirect } from "next/navigation";

/** Performance-Unterseite entfernt; alte Links leiten auf Marktplätze um. */
export default function AnalyticsPerformanceRedirectPage() {
  redirect("/analytics/marketplaces");
}
