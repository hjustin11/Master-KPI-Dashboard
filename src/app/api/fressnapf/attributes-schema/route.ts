import { NextResponse } from "next/server";
import { getFressnapfIntegrationConfig } from "@/shared/lib/fressnapfApiClient";

/**
 * Holt das per-Hierarchie Attribut-Schema von Fressnapfs Mirakl-API.
 * Nutzung: /api/fressnapf/attributes-schema?hierarchy=marketplace_animal_scratch_accessory
 *
 * Liefert ein **kompaktes** JSON nur mit den Feldern, die wir für den
 * Smart-Defaults-Builder brauchen: code, label, required, type, max_length,
 * values_list. Voll-Antwort sonst >300 KB → für Chat-Paste unbrauchbar.
 */
export async function GET(request: Request) {
  const cfg = await getFressnapfIntegrationConfig();
  if (!cfg.apiKey || !cfg.baseUrl) {
    return NextResponse.json({ error: "Fressnapf API nicht konfiguriert." }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const hierarchy = (searchParams.get("hierarchy") ?? "").trim();
  if (!hierarchy) {
    return NextResponse.json(
      {
        error:
          "?hierarchy=<code> erforderlich. Beispiel: /api/fressnapf/attributes-schema?hierarchy=marketplace_animal_scratch_accessory",
      },
      { status: 400 }
    );
  }
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.authMode === "x-api-key") headers["X-API-Key"] = cfg.apiKey;
  else if (cfg.authMode === "bearer") headers.Authorization = `Bearer ${cfg.apiKey}`;
  else headers.Authorization = cfg.apiKey;

  const url = `${base}/api/products/attributes?hierarchy=${encodeURIComponent(hierarchy)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: `Fressnapf API HTTP ${res.status}`, body: text.slice(0, 1500) },
      { status: 502 }
    );
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Antwort kein JSON.", body: text.slice(0, 1500) });
  }

  const list = Array.isArray((parsed as { attributes?: unknown }).attributes)
    ? ((parsed as { attributes: unknown[] }).attributes as Record<string, unknown>[])
    : [];

  // Kompakt-Mapping für Chat-Paste / Smart-Default-Generierung.
  const compact = list.map((a) => {
    const labelTranslations = Array.isArray(a.label_translations) ? a.label_translations : [];
    const deLabel = (labelTranslations as Array<Record<string, unknown>>).find(
      (lt) => typeof lt.locale === "string" && /^de(_DE)?$/.test(lt.locale as string)
    );
    const validations = typeof a.validations === "string" ? (a.validations as string) : "";
    const maxLengthMatch = validations.match(/MAX_LENGTH\|(\d+)/);
    return {
      code: String(a.code ?? ""),
      label: String((deLabel?.value as string | undefined) ?? a.label ?? ""),
      required: a.required === true,
      type: String(a.type ?? ""),
      max_length: maxLengthMatch ? Number(maxLengthMatch[1]) : null,
      values_list: typeof a.values_list === "string" ? (a.values_list as string) : null,
      validations: validations || null,
    };
  });

  const required = compact.filter((c) => c.required);
  const optional = compact.filter((c) => !c.required);

  return NextResponse.json({
    hierarchy,
    total: compact.length,
    required_count: required.length,
    required,
    optional,
  });
}
