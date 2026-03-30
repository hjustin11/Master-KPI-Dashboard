import { NextResponse } from "next/server";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import type { XentralPrimaryAddressFields } from "@/shared/lib/xentralPrimaryAddressFields";

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

async function resolveXentralConfig() {
  const baseUrl = await getIntegrationSecretValue("XENTRAL_BASE_URL");
  const token =
    (await getIntegrationSecretValue("XENTRAL_PAT")) || (await getIntegrationSecretValue("XENTRAL_KEY"));
  return { baseUrl, token };
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function fieldsToShippingAddress(fields: XentralPrimaryAddressFields): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string" && v.trim()) o[k] = v.trim();
  }
  return o;
}

type PatchAttempt = {
  path: string;
  body: unknown;
  contentType: string;
};

function buildPatchAttempts(salesOrderId: string, shippingAddress: Record<string, string>): PatchAttempt[] {
  const enc = encodeURIComponent(salesOrderId);
  const jsonApiBody = (type: string, attributes: Record<string, unknown>) => ({
    data: {
      type,
      id: salesOrderId,
      attributes,
    },
  });

  /**
   * Xentral v1 „Update sales order“ nutzt häufig klassisches JSON (nicht JSON:API).
   * Reihenfolge: zuerst application/json, dann JSON:API-Varianten, zuletzt v3.
   */
  return [
    {
      path: `api/v1/salesOrders/${enc}`,
      body: { shippingAddress },
      contentType: "application/json",
    },
    {
      path: `api/v1/salesOrders/${enc}`,
      body: { delivery: { shippingAddress } },
      contentType: "application/json",
    },
    {
      path: `api/v1/salesOrders/${enc}`,
      body: jsonApiBody("salesOrders", { delivery: { shippingAddress } }),
      contentType: "application/vnd.api+json",
    },
    {
      path: `api/v1/salesOrders/${enc}`,
      body: jsonApiBody("salesOrder", { delivery: { shippingAddress } }),
      contentType: "application/vnd.api+json",
    },
    {
      path: `api/v1/salesOrders/${enc}`,
      body: jsonApiBody("salesOrders", { shippingAddress }),
      contentType: "application/vnd.api+json",
    },
    {
      path: `api/v1/salesorders/${enc}`,
      body: jsonApiBody("salesOrders", { delivery: { shippingAddress } }),
      contentType: "application/vnd.api+json",
    },
    {
      path: `api/v1/salesorders/${enc}`,
      body: { delivery: { shippingAddress } },
      contentType: "application/json",
    },
    {
      path: `api/v3/salesOrders/${enc}`,
      body: jsonApiBody("salesOrders", { delivery: { shippingAddress } }),
      contentType: "application/vnd.api+json",
    },
    {
      path: `api/v3/salesOrders/${enc}`,
      body: { delivery: { shippingAddress } },
      contentType: "application/json",
    },
  ];
}

/** Kurztext aus Xentral-Fehlerantwort (JSON:API errors[] oder { message }). */
function summarizeXentralErrorBody(text: string): string {
  const raw = text.trim();
  if (!raw) return "";
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const errors = j.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as Record<string, unknown>;
      const detail = typeof first.detail === "string" ? first.detail : "";
      const title = typeof first.title === "string" ? first.title : "";
      const combined = [title, detail].filter(Boolean).join(": ");
      if (combined) return combined.slice(0, 500);
    }
    const msg = typeof j.message === "string" ? j.message : "";
    if (msg) return msg.slice(0, 500);
  } catch {
    /* Rohtext */
  }
  return raw.slice(0, 600);
}

async function patchOneSalesOrderShipping(args: {
  baseUrl: string;
  token: string;
  salesOrderId: string;
  fields: XentralPrimaryAddressFields;
}): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const shippingAddress = fieldsToShippingAddress(args.fields);
  if (Object.keys(shippingAddress).length === 0) {
    return { ok: false, status: 400, detail: "Keine Adressfelder zum Senden." };
  }

  const attempts = buildPatchAttempts(args.salesOrderId, shippingAddress);
  let lastStatus = 0;
  let lastDetail = "";

  for (const att of attempts) {
    const url = joinUrl(args.baseUrl, att.path);
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${args.token}`,
        Accept: "application/vnd.api+json, application/json;q=0.9, */*;q=0.8",
        "Content-Type": att.contentType,
      },
      body: JSON.stringify(att.body),
      cache: "no-store",
    });
    const text = await res.text();
    lastStatus = res.status;
    const summary = summarizeXentralErrorBody(text);
    lastDetail = summary || text.slice(0, 800);

    if (res.ok) return { ok: true };

    /** Nächstes Payload-Format probieren (falsche Struktur / falscher Content-Type). */
    const tryNextAttempt =
      res.status === 404 ||
      res.status === 405 ||
      res.status === 400 ||
      res.status === 415 ||
      res.status === 406 ||
      res.status === 422;

    if (!tryNextAttempt) {
      return { ok: false, status: res.status, detail: lastDetail || res.statusText };
    }
  }

  return {
    ok: false,
    status: lastStatus,
    detail:
      summarizeXentralErrorBody(lastDetail) ||
      lastDetail ||
      "Keine kompatible Xentral-Update-Struktur (alle Varianten abgelehnt).",
  };
}

export async function POST(request: Request) {
  const { baseUrl, token } = await resolveXentralConfig();
  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "Xentral nicht konfiguriert (XENTRAL_BASE_URL, XENTRAL_PAT / KEY)." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const root = body as { updates?: unknown };
  const updates = root?.updates;
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "updates[] erforderlich." }, { status: 400 });
  }

  const results: Array<{
    salesOrderId: string;
    ok: boolean;
    error?: string;
    status?: number;
  }> = [];

  for (const item of updates) {
    if (!item || typeof item !== "object") continue;
    const u = item as { salesOrderId?: unknown; addressPrimaryFields?: unknown };
    const id = typeof u.salesOrderId === "string" ? u.salesOrderId.trim() : "";
    const fields = u.addressPrimaryFields as XentralPrimaryAddressFields | undefined;
    if (!id || !fields || typeof fields !== "object") {
      results.push({ salesOrderId: id || "?", ok: false, error: "Ungültiger Eintrag." });
      continue;
    }

    const r = await patchOneSalesOrderShipping({ baseUrl, token, salesOrderId: id, fields });
    if (r.ok) {
      results.push({ salesOrderId: id, ok: true });
    } else {
      results.push({
        salesOrderId: id,
        ok: false,
        error: r.detail,
        status: r.status,
      });
    }
  }

  const failed = results.filter((x) => !x.ok);
  if (failed.length > 0 && failed.length === results.length) {
    const first = failed[0];
    const statusStr = first?.status != null ? `HTTP ${first.status}` : "Fehler";
    const detail = (first?.error ?? "Keine Detailmeldung von Xentral.").trim().slice(0, 900);
    const error = `Xentral-Update fehlgeschlagen (${statusStr}, Auftrag ${first?.salesOrderId ?? "?"}): ${detail}`;
    return NextResponse.json({ error, results }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    results,
    partialFailures: failed.length > 0 ? failed : undefined,
  });
}
