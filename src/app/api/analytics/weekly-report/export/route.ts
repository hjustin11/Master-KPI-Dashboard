import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import {
  getIsoWeekByNumber,
  getLastCompletedIsoWeek,
  getPreviousIsoWeek,
} from "@/shared/lib/weeklyReport/isoWeekResolver";
import { getWeeklyReport } from "@/shared/lib/weeklyReport/weeklyReportService";
import { renderWeeklyReportHtml } from "@/shared/lib/weeklyReport/weeklyReportHtmlRenderer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseInteger(input: string | null): number | null {
  if (!input) return null;
  const n = Number(input);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const url = new URL(request.url);
  const yearParam = parseInteger(url.searchParams.get("year"));
  const weekParam = parseInteger(url.searchParams.get("week"));

  let current;
  if (yearParam && weekParam && weekParam >= 1 && weekParam <= 53) {
    current = getIsoWeekByNumber(yearParam, weekParam);
  } else {
    current = getLastCompletedIsoWeek();
  }
  const previous = getPreviousIsoWeek(current);

  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const report = await getWeeklyReport({
      current,
      previous,
      origin: url.origin,
      cookieHeader,
    });
    const html = renderWeeklyReportHtml(report);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export fehlgeschlagen." },
      { status: 500 }
    );
  }
}
