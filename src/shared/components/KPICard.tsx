"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

type KPITrend = "positive" | "negative" | "neutral";

type KPICardProps = {
  title: string;
  value: string;
  trendLabel?: string;
  trend?: KPITrend;
  sparklineData?: Array<{ value: number }>;
  className?: string;
};

export function KPICard({
  title,
  value,
  trendLabel,
  trend = "neutral",
  sparklineData = [],
  className,
}: KPICardProps) {
  const TrendIcon = trend === "positive" ? TrendingUp : TrendingDown;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-6",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {trendLabel ? (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs",
            trend === "positive" && "text-emerald-400",
            trend === "negative" && "text-red-400",
            trend === "neutral" && "text-blue-400"
          )}
        >
          <TrendIcon className="h-3.5 w-3.5" />
          <span>{trendLabel}</span>
        </div>
      ) : null}
      {sparklineData.length > 0 ? (
        <div className="mt-3 h-12 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData}>
              <Line
                dataKey="value"
                stroke="currentColor"
                strokeWidth={2}
                dot={false}
                className={cn(
                  trend === "positive" && "text-emerald-400",
                  trend === "negative" && "text-red-400",
                  trend === "neutral" && "text-blue-400"
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}
