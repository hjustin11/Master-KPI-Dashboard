export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-2xl font-semibold">Master Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Einstiegspunkt vorbereitet. Nutze /login oder /analytics.
        </p>
      </div>
    </main>
  );
}
