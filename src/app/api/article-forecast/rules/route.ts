import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  DEFAULT_ARTICLE_FORECAST_RULES,
  sanitizeArticleForecastRules,
  type ArticleForecastRuleScope,
  type ArticleForecastRulesByScope,
} from "@/shared/lib/articleForecastRules";

function emptyByScope(): ArticleForecastRulesByScope {
  return {
    fixed: { ...DEFAULT_ARTICLE_FORECAST_RULES },
    temporary: { ...DEFAULT_ARTICLE_FORECAST_RULES },
  };
}

function isScope(value: unknown): value is ArticleForecastRuleScope {
  return value === "fixed" || value === "temporary";
}

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server-Konfiguration unvollständig (Supabase Service Role)." },
      { status: 503 }
    );
  }

  const { data, error } = await admin
    .from("article_forecast_rules")
    .select(
      "scope,sales_window_days,projection_days,low_stock_threshold,critical_stock_threshold,include_inbound_procurement"
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const out = emptyByScope();
  for (const row of data ?? []) {
    const scope = String(row.scope ?? "");
    if (!isScope(scope)) continue;
    out[scope] = sanitizeArticleForecastRules({
      salesWindowDays: Number(row.sales_window_days ?? DEFAULT_ARTICLE_FORECAST_RULES.salesWindowDays),
      projectionDays: Number(row.projection_days ?? DEFAULT_ARTICLE_FORECAST_RULES.projectionDays),
      lowStockThreshold: Number(
        row.low_stock_threshold ?? DEFAULT_ARTICLE_FORECAST_RULES.lowStockThreshold
      ),
      criticalStockThreshold: Number(
        row.critical_stock_threshold ?? DEFAULT_ARTICLE_FORECAST_RULES.criticalStockThreshold
      ),
      includeInboundProcurement:
        typeof row.include_inbound_procurement === "boolean"
          ? row.include_inbound_procurement
          : DEFAULT_ARTICLE_FORECAST_RULES.includeInboundProcurement,
    });
  }

  return NextResponse.json({ rules: out });
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

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server-Konfiguration unvollständig (Supabase Service Role)." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { scope?: unknown; rules?: Record<string, unknown> }
    | null;

  const scope = body?.scope;
  if (!isScope(scope)) {
    return NextResponse.json({ error: "Ungültiger Scope (fixed|temporary)." }, { status: 400 });
  }

  const rules = sanitizeArticleForecastRules((body?.rules as Partial<typeof DEFAULT_ARTICLE_FORECAST_RULES>) ?? {});

  const { error } = await admin.from("article_forecast_rules").upsert(
    {
      scope,
      sales_window_days: rules.salesWindowDays,
      projection_days: rules.projectionDays,
      low_stock_threshold: rules.lowStockThreshold,
      critical_stock_threshold: rules.criticalStockThreshold,
      include_inbound_procurement: rules.includeInboundProcurement,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "scope" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scope, rules });
}
