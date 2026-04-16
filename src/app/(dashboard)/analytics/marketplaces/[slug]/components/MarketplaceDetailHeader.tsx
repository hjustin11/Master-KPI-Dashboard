"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { RefreshCw, Play, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MarketplaceOverviewData } from "@/shared/hooks/useMarketplaceDetail";

function fmtDateDe(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function MarketplaceDetailHeader({
  slug,
  data,
  loading,
  onSync,
  syncing,
}: {
  slug: string;
  data: MarketplaceOverviewData | null;
  loading: boolean;
  onSync?: () => void;
  syncing?: boolean;
}) {
  const router = useRouter();
  const name = data?.marketplace.name ?? "...";
  const logo = data?.marketplace.logo ?? "";
  const connected = data?.marketplace.connected ?? false;

  function handleExportHtml() {
    const from = data?.range.from ?? "";
    const to = data?.range.to ?? "";
    window.open(`/api/marketplace-detail/${slug}/export?from=${from}&to=${to}`, "_self");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        {logo && (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border bg-white p-2 shadow-sm dark:bg-card">
            <Image src={logo} alt={name} width={48} height={48} className="h-12 w-12 object-contain" unoptimized />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-black dark:text-white">{name}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
            <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-300"}`} />
            <span>{connected ? "Verbunden" : "Nicht verbunden"}</span>
            {data && !loading && (
              <>
                <span>·</span>
                <span>{fmtDateDe(data.range.from)} — {fmtDateDe(data.range.to)}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(`/analytics/marketplaces/${slug}/present`)}
          disabled={loading}
          className="h-8 text-xs"
        >
          <Play className="mr-1.5 h-3 w-3" />
          Präsentieren
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExportHtml}
          disabled={loading}
          className="h-8 text-xs"
        >
          <Download className="mr-1.5 h-3 w-3" />
          Export
        </Button>
        {onSync && (
          <Button size="sm" variant="outline" onClick={onSync} disabled={syncing || loading} className="h-8 text-xs">
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sync..." : "Sync"}
          </Button>
        )}
      </div>
    </div>
  );
}
