import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PeriodRow = {
  period_from: string;
  period_to: string;
  marketplace_slug: string;
};

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server-Konfiguration unvollständig." }, { status: 503 });
  }

  // Letzte 12 Monate an Settlement-Perioden
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("marketplace_payouts")
    .select("period_from, period_to, marketplace_slug")
    .gte("period_from", cutoffStr)
    .order("period_from", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplizieren: gleiche (period_from, period_to, marketplace_slug) nur einmal
  const seen = new Set<string>();
  const todayMs = new Date().setHours(23, 59, 59, 999);

  const periods = (data as PeriodRow[])
    .filter((r) => {
      const key = `${r.period_from}|${r.period_to}|${r.marketplace_slug}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      periodFrom: r.period_from,
      periodTo: r.period_to,
      marketplace: r.marketplace_slug,
      isOpen: new Date(r.period_to).getTime() >= todayMs - 86_400_000,
    }));

  return NextResponse.json(
    { periods },
    { headers: { "Cache-Control": "no-store" } }
  );
}
