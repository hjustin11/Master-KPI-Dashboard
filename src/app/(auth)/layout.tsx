export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-200 via-slate-100 to-slate-50 p-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-blue-300/50 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-indigo-300/45 blur-3xl" />
        <div className="absolute bottom-[-110px] left-1/3 h-64 w-64 rounded-full bg-sky-300/50 blur-3xl" />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
        <div className="grid w-full max-w-5xl grid-cols-12 gap-4 opacity-70 blur-lg">
          <div className="col-span-12 h-14 rounded-xl border border-slate-400/60 bg-slate-200/70 shadow-sm" />
          <div className="col-span-8 h-36 rounded-xl border border-slate-400/60 bg-slate-200/70 shadow-sm" />
          <div className="col-span-4 h-36 rounded-xl border border-slate-400/60 bg-slate-200/70 shadow-sm" />
          <div className="col-span-5 h-28 rounded-xl border border-slate-400/60 bg-slate-200/70 shadow-sm" />
          <div className="col-span-7 h-28 rounded-xl border border-slate-400/60 bg-slate-200/70 shadow-sm" />
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
