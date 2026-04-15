import { NextResponse } from "next/server";

/**
 * Einheitliches API-Response-Envelope.
 *
 * Historisch haben unsere Routen Success-Payloads ad-hoc zurückgegeben (`{ deals: [...] }`,
 * `{ items: [...] }`, Top-Level-Objekte). Dieser Helper setzt ein einheitliches Format für **neue**
 * Routen und für Routen, die sowieso gerade angefasst werden. Bestehende Routen werden
 * schrittweise migriert — ein großer Big-Bang wäre zu riskant.
 *
 * **Envelope:**
 * - Erfolg: `{ data: T }`
 * - Fehler: `{ error: string; details?: unknown }`
 *
 * Der Client kann per `"error" in payload` diskriminieren.
 */

export type ApiResponse<T> = { data: T } | { error: string; details?: unknown };

export function apiOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data } satisfies ApiResponse<T>, init);
}

export function apiError(
  error: string,
  options: { status?: number; details?: unknown } = {}
): NextResponse {
  const payload: { error: string; details?: unknown } = { error };
  if (options.details !== undefined) payload.details = options.details;
  return NextResponse.json(payload, { status: options.status ?? 500 });
}

export function apiUnauthenticated(): NextResponse {
  return apiError("Nicht authentifiziert.", { status: 401 });
}

export function apiForbidden(): NextResponse {
  return apiError("Zugriff verweigert.", { status: 403 });
}

export function apiNotFound(what = "Ressource"): NextResponse {
  return apiError(`${what} nicht gefunden.`, { status: 404 });
}

export function apiBadRequest(message: string, details?: unknown): NextResponse {
  return apiError(message, { status: 400, details });
}
