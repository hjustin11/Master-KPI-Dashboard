import { NextResponse } from "next/server";
import { getKauflandIntegrationConfig, kauflandSignedFetch } from "@/shared/lib/kauflandApiClient";

type UnitRow = {
  idUnit: string;
  title: string;
  quantity: number;
  priceEur: number | null;
  status: string;
};

function pickString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pickNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function GET() {
  try {
    const config = await getKauflandIntegrationConfig();
    const missing = {
      KAUFLAND_CLIENT_KEY: !config.clientKey,
      KAUFLAND_SECRET_KEY: !config.secretKey,
    };
    if (Object.values(missing).some(Boolean)) {
      return NextResponse.json(
        {
          error: "Kaufland API ist nicht vollständig konfiguriert.",
          missingKeys: Object.entries(missing).filter(([, v]) => v).map(([k]) => k),
        },
        { status: 500 }
      );
    }

    const res = await kauflandSignedFetch(config, "/v2/units?limit=100&offset=0");
    const text = await res.text();
    let json: { data?: unknown[] } | null = null;
    try {
      json = text ? (JSON.parse(text) as { data?: unknown[] }) : null;
    } catch {
      json = null;
    }
    if (!res.ok || !json) {
      return NextResponse.json(
        { error: `Kaufland units (${res.status})` },
        { status: 502 }
      );
    }

    const rows: UnitRow[] = (Array.isArray(json.data) ? json.data : []).map((raw) => {
      const u = raw as Record<string, unknown>;
      const idOffer = pickString(u.id_offer ?? u.idOffer);
      const title =
        pickString(u.title) ||
        pickString((u.product as Record<string, unknown> | undefined)?.title) ||
        "—";
      const quantity = pickNumber(u.quantity ?? u.amount ?? 0);
      const priceRaw = u.price ?? u.fixed_price;
      const priceNum = pickNumber(priceRaw);
      const priceEur = priceNum > 0 ? Number((priceNum / 100).toFixed(2)) : null;
      const status = pickString(u.status ?? u.unit_status ?? "");
      return {
        idUnit: idOffer || pickString(u.id_unit) || "—",
        title,
        quantity,
        priceEur,
        status,
      };
    });

    return NextResponse.json({ items: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
