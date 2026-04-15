"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrendDirection } from "@/shared/lib/marketplace-sales-types";

export function TrendIcon({
  direction,
  compact = false,
}: {
  direction: TrendDirection;
  compact?: boolean;
}) {
  const cls = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  if (direction === "up") return <TrendingUp className={cn(cls, "text-emerald-600")} aria-hidden />;
  if (direction === "down") return <TrendingDown className={cn(cls, "text-rose-600")} aria-hidden />;
  return null;
}
