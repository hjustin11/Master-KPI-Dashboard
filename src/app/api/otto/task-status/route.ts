import { NextResponse } from "next/server";
import {
  ensureOttoProductsScope,
  getOttoAccessToken,
  getOttoIntegrationConfig,
} from "@/shared/lib/ottoApiClient";

export const maxDuration = 60;

/**
 * Otto-Task-Status-Polling für asynchrone Product-Uploads.
 *
 * Nutzung: `GET /api/otto/task-status?uuid=<task-uuid>` — UUID kommt aus der
 * Response von `POST /v5/products` (siehe `submissionId` im Submit-Flow).
 *
 * Antwort aggregiert Progress + Result:
 *   - `progress`  → aus `GET /v5/products/update-tasks/{uuid}`
 *   - `result`    → aus `GET /v5/products/update-tasks/{uuid}/result` (falls `state != pending`)
 *
 * Referenz: OTTO_LISTING_UPLOAD.md §10.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uuid = (searchParams.get("uuid") ?? "").trim();
  if (!uuid) {
    return NextResponse.json({ error: "uuid required" }, { status: 400 });
  }

  const cfg = await getOttoIntegrationConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    return NextResponse.json(
      { error: "Otto API nicht konfiguriert (OTTO_API_CLIENT_ID/SECRET)." },
      { status: 500 }
    );
  }

  const scopes = ensureOttoProductsScope(cfg.scopes);
  const token = await getOttoAccessToken({
    baseUrl: cfg.baseUrl,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    scopes,
  });

  const base = cfg.baseUrl.replace(/\/+$/, "");
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
  const encoded = encodeURIComponent(uuid);

  const fetchJson = async (path: string): Promise<{ status: number; json: unknown; raw?: string }> => {
    const res = await fetch(`${base}${path}`, { method: "GET", headers, cache: "no-store" });
    const text = await res.text();
    try {
      return { status: res.status, json: text ? JSON.parse(text) : null };
    } catch {
      return { status: res.status, json: null, raw: text.slice(0, 1000) };
    }
  };

  const progress = await fetchJson(`/v5/products/update-tasks/${encoded}`);
  const state =
    progress.json && typeof progress.json === "object" && "state" in progress.json
      ? String((progress.json as { state: unknown }).state)
      : null;

  let result: { status: number; json: unknown; raw?: string } | null = null;
  if (state && state !== "pending") {
    result = await fetchJson(`/v5/products/update-tasks/${encoded}/result`);
  }

  return NextResponse.json({
    ok: progress.status >= 200 && progress.status < 300,
    uuid,
    state,
    progress: progress.json,
    progressHttpStatus: progress.status,
    result: result?.json ?? null,
    resultHttpStatus: result?.status ?? null,
  });
}
