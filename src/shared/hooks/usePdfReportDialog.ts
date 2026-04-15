"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buildMarketplaceReportHtml,
  type MarketplaceReportRow,
} from "@/app/(dashboard)/analytics/marketplaces/MarketplaceReportPrintView";

export type PdfReportMode = "all" | "single" | "selected";

export default function usePdfReportDialog({
  reportRows,
  periodFrom,
  periodTo,
  intlTag,
}: {
  reportRows: MarketplaceReportRow[];
  periodFrom: string;
  periodTo: string;
  intlTag: string;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState<PdfReportMode>("all");
  const [reportMarketplaceId, setReportMarketplaceId] = useState<string>("amazon");
  const [reportSelectedIds, setReportSelectedIds] = useState<string[]>([
    "amazon",
    "ebay",
    "otto",
    "kaufland",
    "fressnapf",
    "mediamarkt-saturn",
    "zooplus",
    "tiktok",
    "shopify",
  ]);

  const activeReportRows = useMemo(() => {
    if (reportMode === "single") {
      return reportRows.filter((row) => row.id === reportMarketplaceId);
    }
    if (reportMode === "selected") {
      const rows = reportRows.filter((row) => reportSelectedIds.includes(row.id));
      return rows.length > 0 ? rows : reportRows;
    }
    return reportRows;
  }, [reportMode, reportMarketplaceId, reportRows, reportSelectedIds]);

  const printReport = useCallback(() => {
    const html = buildMarketplaceReportHtml({
      periodFrom,
      periodTo,
      mode: reportMode,
      rows: activeReportRows,
      intlTag,
    });
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      const triggerPrint = () => {
        popup.focus();
        popup.print();
      };
      popup.addEventListener("load", triggerPrint, { once: true });
      window.setTimeout(triggerPrint, 350);
      return;
    }

    // Fallback für Browser/Settings mit Popup-Blockern.
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
      }, 700);
    };
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      cleanup();
    };
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      cleanup();
    }, 400);
  }, [periodFrom, periodTo, reportMode, activeReportRows, intlTag]);

  return {
    reportOpen,
    setReportOpen,
    reportMode,
    setReportMode,
    reportMarketplaceId,
    setReportMarketplaceId,
    reportSelectedIds,
    setReportSelectedIds,
    activeReportRows,
    printReport,
  };
}
