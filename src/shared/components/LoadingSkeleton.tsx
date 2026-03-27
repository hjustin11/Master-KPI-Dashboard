import { Skeleton } from "@/components/ui/skeleton";

type LoadingSkeletonProps = {
  rows?: number;
};

export function LoadingSkeleton({ rows = 5 }: LoadingSkeletonProps) {
  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-6">
      <Skeleton className="h-7 w-56 animate-pulse" />
      <Skeleton className="h-10 w-full animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full animate-pulse" />
        ))}
      </div>
    </div>
  );
}
