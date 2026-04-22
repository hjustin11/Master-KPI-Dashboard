import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseInt32(input: string | null): number | null {
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
  const year = parseInt32(url.searchParams.get("year"));
  const week = parseInt32(url.searchParams.get("week"));
  if (year === null || week === null || week < 1 || week > 53) {
    return NextResponse.json({ error: "Ungültige Parameter year/week." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("weekly_report_notes")
    .select("marketplace_slug, note, updated_at")
    .eq("iso_year", year)
    .eq("iso_week", week);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notes: Record<string, { note: string; updatedAt: string }> = {};
  for (const row of data ?? []) {
    notes[row.marketplace_slug] = {
      note: row.note ?? "",
      updatedAt: row.updated_at,
    };
  }
  return NextResponse.json({ year, week, notes });
}

export async function PUT(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const year = typeof b.year === "number" ? b.year : null;
  const week = typeof b.week === "number" ? b.week : null;
  const slug = typeof b.marketplaceSlug === "string" ? b.marketplaceSlug.trim() : "";
  const note = typeof b.note === "string" ? b.note : "";
  if (year === null || week === null || week < 1 || week > 53 || !slug) {
    return NextResponse.json({ error: "year, week, marketplaceSlug erforderlich." }, { status: 400 });
  }
  if (note.length > 10_000) {
    return NextResponse.json({ error: "Notiz zu lang (max. 10 000 Zeichen)." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("weekly_report_notes")
    .upsert(
      {
        iso_year: year,
        iso_week: week,
        marketplace_slug: slug,
        note,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "iso_year,iso_week,marketplace_slug" }
    )
    .select("note, updated_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ note: data?.note ?? "", updatedAt: data?.updated_at });
}
