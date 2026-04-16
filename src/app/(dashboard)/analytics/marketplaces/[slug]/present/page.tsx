"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { getMarketplaceBySlug } from "@/shared/lib/analytics-marketplaces";
import useMarketplaceDetail from "@/shared/hooks/useMarketplaceDetail";
import useMarketplaceProducts from "@/shared/hooks/useMarketplaceProducts";
import { generateNarrative } from "@/shared/lib/marketplaceDetail/marketplaceNarrativeGenerator";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

const TOTAL_SLIDES = 7;

export default function MarketplacePresentationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const marketplace = getMarketplaceBySlug(slug);
  const { data, loading } = useMarketplaceDetail(slug);
  const { data: productsData } = useMarketplaceProducts(slug);
  const [slide, setSlide] = useState(0);

  const next = useCallback(() => setSlide((s) => Math.min(s + 1, TOTAL_SLIDES - 1)), []);
  const prev = useCallback(() => setSlide((s) => Math.max(s - 1, 0)), []);
  const exit = useCallback(() => router.push(`/analytics/marketplaces/${slug}`), [router, slug]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      if (e.key === "Escape") exit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, exit]);

  if (!marketplace) return null;

  const name = data?.marketplace.name ?? marketplace.label;
  const logo = data?.marketplace.logo ?? marketplace.logo;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a] text-white">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          {logo && <Image src={logo} alt={name} width={28} height={28} className="h-7 w-7 rounded object-contain" unoptimized />}
          <span className="text-sm font-bold text-white/80">{name}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-white/40 tabular-nums">{slide + 1} / {TOTAL_SLIDES}</span>
          <button onClick={exit} className="rounded bg-white/10 px-3 py-1 text-xs font-bold text-white/70 hover:bg-white/20">
            Beenden
          </button>
        </div>
      </div>

      {/* Slide area */}
      <div className="flex flex-1 items-center justify-center px-8 pb-8">
        <div className="w-full max-w-4xl">
          {slide === 0 && <SlideTitel name={name} logo={logo} data={data} loading={loading} />}
          {slide === 1 && <SlideSummary data={data} productsData={productsData} loading={loading} />}
          {slide === 2 && <SlideKpis data={data} loading={loading} />}
          {slide === 3 && <SlideTimeSeries data={data} loading={loading} />}
          {slide === 4 && <SlideTopProducts productsData={productsData} />}
          {slide === 5 && <SlideChallenges productsData={productsData} />}
          {slide === 6 && <SlideFazit data={data} name={name} />}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex shrink-0 items-center justify-between px-6 pb-4">
        <button onClick={prev} disabled={slide === 0} className="rounded bg-white/10 px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/20 disabled:opacity-30">
          ← Zurück
        </button>
        {/* Progress */}
        <div className="flex gap-1">
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <button key={i} onClick={() => setSlide(i)} className={`h-1.5 rounded-full transition-all ${i === slide ? "w-8 bg-white" : "w-3 bg-white/20 hover:bg-white/40"}`} />
          ))}
        </div>
        <button onClick={next} disabled={slide === TOTAL_SLIDES - 1} className="rounded bg-white/10 px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/20 disabled:opacity-30">
          Weiter →
        </button>
      </div>
    </div>
  );
}

function SlideTitel({ name, logo, data, loading }: { name: string; logo: string; data: ReturnType<typeof useMarketplaceDetail>["data"]; loading: boolean }) {
  return (
    <div className="text-center">
      {logo && <Image src={logo} alt={name} width={80} height={80} className="mx-auto h-20 w-20 rounded-xl object-contain" unoptimized />}
      <h1 className="mt-6 text-5xl font-extrabold tracking-tight">{name}</h1>
      <p className="mt-3 text-xl text-white/50">Marktplatz-Analyse</p>
      {data && !loading && (
        <p className="mt-2 text-lg text-white/40">{fmtDate(data.range.from)} — {fmtDate(data.range.to)}</p>
      )}
    </div>
  );
}

function SlideSummary({ data, productsData, loading }: { data: ReturnType<typeof useMarketplaceDetail>["data"]; productsData: ReturnType<typeof useMarketplaceProducts>["data"]; loading: boolean }) {
  if (loading || !data) return <p className="text-center text-white/50">Lade Daten...</p>;
  const narrative = generateNarrative(data, productsData);
  return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/30">Executive Summary</p>
      <p className="mx-auto mt-6 max-w-2xl text-2xl leading-relaxed text-white/90">{narrative}</p>
    </div>
  );
}

function SlideKpis({ data, loading }: { data: ReturnType<typeof useMarketplaceDetail>["data"]; loading: boolean }) {
  if (loading || !data) return <p className="text-center text-white/50">Lade Daten...</p>;
  const kpis = [
    { label: "Bruttoumsatz", value: formatEur(data.totals.grossSales), delta: data.deltas.grossSales },
    { label: "Bestellungen", value: String(data.totals.orders), delta: data.deltas.orders },
    { label: "Ø Bestellwert", value: formatEur(data.totals.avgOrderValue), delta: data.deltas.avgOrderValue },
    { label: "Retourenquote", value: `${(data.totals.returnRate * 100).toFixed(1)} %`, delta: null },
    { label: "Netto", value: formatEur(data.totals.netPayout), delta: null },
  ];
  return (
    <div>
      <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-white/30">Kennzahlen</p>
      <div className="mt-8 grid grid-cols-5 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg bg-white/5 p-5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">{k.label}</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums">{k.value}</p>
            {k.delta !== null && (
              <p className={`mt-1 text-sm font-bold ${k.delta > 0 ? "text-white/70" : "text-white/50"}`}>
                {k.delta > 0 ? "▲ +" : "▼ "}{k.delta.toFixed(1)} %
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideTimeSeries({ data, loading }: { data: ReturnType<typeof useMarketplaceDetail>["data"]; loading: boolean }) {
  if (loading || !data || !data.points?.length) return <p className="text-center text-white/50">Keine Zeitreihendaten.</p>;
  const points = (data.points as Array<Record<string, unknown>>).map((p) => ({
    date: String(p.date ?? "").slice(5),
    amount: Number(p.amount ?? 0),
  }));
  return (
    <div>
      <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-white/30">Umsatz-Entwicklung</p>
      <div className="mt-6 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} />
            <YAxis tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} width={40} />
            <Line type="monotone" dataKey="amount" stroke="#fff" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SlideTopProducts({ productsData }: { productsData: ReturnType<typeof useMarketplaceProducts>["data"] }) {
  const top = productsData?.products.filter((p) => p.revenueCurrent > 0).slice(0, 8) ?? [];
  if (top.length === 0) return <p className="text-center text-white/50">Keine Produktdaten.</p>;
  return (
    <div>
      <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-white/30">Top-Performer</p>
      <div className="mt-6 space-y-2">
        {top.map((p, i) => (
          <div key={p.sku} className="flex items-center gap-4 rounded-lg bg-white/5 px-4 py-3">
            <span className="w-6 text-right text-sm font-bold text-white/30">{i + 1}</span>
            <span className="flex-1 truncate text-sm font-medium">{p.name || p.sku}</span>
            <span className="tabular-nums text-sm font-bold">{formatEur(p.revenueCurrent)}</span>
            <span className={`text-xs font-bold ${p.deltaPct > 0 ? "text-white/70" : "text-white/40"}`}>
              {p.deltaPct > 0 ? "+" : ""}{p.deltaPct.toFixed(0)} %
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideChallenges({ productsData }: { productsData: ReturnType<typeof useMarketplaceProducts>["data"] }) {
  const losers = productsData?.products.filter((p) => p.status === "losing_ground" || p.status === "sunset").slice(0, 6) ?? [];
  if (losers.length === 0) return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/30">Herausforderungen</p>
      <p className="mt-8 text-xl text-white/50">Keine kritischen Produkt-Einbrüche in dieser Periode.</p>
    </div>
  );
  return (
    <div>
      <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-white/30">Herausforderungen</p>
      <div className="mt-6 space-y-2">
        {losers.map((p) => (
          <div key={p.sku} className="flex items-center gap-4 rounded-lg bg-white/5 px-4 py-3">
            <span className="flex-1 truncate text-sm font-medium">{p.name || p.sku}</span>
            <span className="tabular-nums text-sm text-white/50">{formatEur(p.revenuePrevious)} →</span>
            <span className="tabular-nums text-sm font-bold">{formatEur(p.revenueCurrent)}</span>
            <span className="text-xs font-bold text-white/40">{p.deltaPct.toFixed(0)} %</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideFazit({ data, name }: { data: ReturnType<typeof useMarketplaceDetail>["data"]; name: string }) {
  return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/30">Fazit & nächste Schritte</p>
      <h2 className="mt-8 text-4xl font-extrabold">{name}</h2>
      {data && (
        <p className="mt-4 text-xl text-white/60">
          Bruttoumsatz: {formatEur(data.totals.grossSales)} · Netto: {formatEur(data.totals.netPayout)}
        </p>
      )}
      <div className="mx-auto mt-8 max-w-md space-y-3 text-left">
        <div className="rounded-lg bg-white/5 p-4">
          <p className="text-sm font-bold">1. Listing-Check für Verlierer-Produkte</p>
          <p className="mt-1 text-xs text-white/50">Buy-Box, Preis, Bilder, Lagerbestand prüfen</p>
        </div>
        <div className="rounded-lg bg-white/5 p-4">
          <p className="text-sm font-bold">2. Werbebudget auf Top-Performer umschichten</p>
          <p className="mt-1 text-xs text-white/50">TACOS-Ziel: unter 15 %</p>
        </div>
        <div className="rounded-lg bg-white/5 p-4">
          <p className="text-sm font-bold">3. Retouren-Ursachen analysieren</p>
          <p className="mt-1 text-xs text-white/50">Seller Central Retourengründe auswerten</p>
        </div>
      </div>
    </div>
  );
}
