type KPICardProps = {
  title: string;
  value: string;
};

export function KPICard({ title, value }: KPICardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
