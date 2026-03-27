export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
