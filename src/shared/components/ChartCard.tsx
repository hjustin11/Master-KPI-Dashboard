"use client";

import { Download, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChartCardProps = {
  title: string;
  description?: string;
  onFilterClick?: () => void;
  onExportClick?: () => void;
  children: React.ReactNode;
  className?: string;
};

export function ChartCard({
  title,
  description,
  onFilterClick,
  onExportClick,
  children,
  className,
}: ChartCardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-6",
        className
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onFilterClick}>
            <SlidersHorizontal className="h-4 w-4" />
            Filter
          </Button>
          <Button variant="outline" size="sm" onClick={onExportClick}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>
      {children}
    </section>
  );
}
