"use client";

import { ADDRESS_ERROR_DEMO_ID_PREFIX } from "./addressErrorDemoOrders";
import {
  isXentralSalesOrderAbsoluteUrlTemplate,
  xentralSalesOrderDetailUrl,
} from "@/shared/lib/xentralSalesOrderWebLink";
import { cn } from "@/lib/utils";

type XentralBelegNumberLinkProps = {
  documentNumber: string;
  salesOrderId: string;
  webBase: string | null;
  webPath: string;
  className?: string;
};

export function XentralBelegNumberLink({
  documentNumber,
  salesOrderId,
  webBase,
  webPath,
  className,
}: XentralBelegNumberLinkProps) {
  const isDemo = salesOrderId.startsWith(ADDRESS_ERROR_DEMO_ID_PREFIX);
  const templateOk = isXentralSalesOrderAbsoluteUrlTemplate(webPath);
  const canLink = Boolean(
    salesOrderId.trim() && !isDemo && (templateOk || webBase?.trim())
  );

  if (!canLink) {
    return (
      <span className={cn("font-medium tabular-nums", className)} title={documentNumber}>
        {documentNumber}
      </span>
    );
  }

  const href = xentralSalesOrderDetailUrl({
    webBase: webBase?.trim() ?? null,
    pathPrefix: webPath,
    salesOrderId,
  });

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "font-medium tabular-nums text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className
      )}
      title={`Auftrag in Xentral öffnen (${documentNumber})`}
    >
      {documentNumber}
    </a>
  );
}
