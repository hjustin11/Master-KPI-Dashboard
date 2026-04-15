import { NextResponse } from "next/server";

/**
 * Sehr leichter In-Memory Sliding-Window-Rate-Limiter.
 *
 * **Warum kein Upstash/Redis:** Für eine einzelne Vercel-Instanz und moderate Öffentlichkeits-
 * Traffic (Invitations-Lookup, Feedback-Submit, Address-Suggest) reicht ein Per-Lambda-Limiter.
 * Vercel skaliert zwar horizontal, aber jede Instanz wendet ihr eigenes Limit an — das ist für
 * **Schutz** (nicht Fairness) ausreichend.
 *
 * **Wichtig:** Im Dev/Single-Node ist das Limit exakt. In Prod mit mehreren Vercel-Lambdas ist
 * das Limit pro Lambda. Wer striktere Garantien braucht, baut auf Upstash um — dafür ist die
 * API bewusst kompatibel gehalten.
 */

type Bucket = { hits: number[]; firstSeenAt: number };

const buckets = new Map<string, Bucket>();

// Sehr simpler Garbage-Collector: alle 60s alte Buckets löschen.
let lastGc = 0;
function maybeGc(now: number) {
  if (now - lastGc < 60_000) return;
  lastGc = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > 10 * 60_000) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  maybeGc(now);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [], firstSeenAt: now };
    buckets.set(key, bucket);
  }

  // Sliding-Window: alle Hits älter als windowMs entfernen
  const cutoff = now - windowMs;
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  const ok = bucket.hits.length < limit;
  if (ok) {
    bucket.hits.push(now);
  }
  const oldest = bucket.hits[0] ?? now;
  return {
    ok,
    limit,
    remaining: Math.max(0, limit - bucket.hits.length),
    resetAt: oldest + windowMs,
  };
}

/** Erzeugt einen stabilen Key aus Request: IP + optional Pfad. */
export function rateLimitKeyFromRequest(req: Request, scope = ""): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip =
    fwd.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  return `${scope}:${ip}`;
}

/** Setzt die Standard-`X-RateLimit-*` Header auf eine Response. */
export function applyRateLimitHeaders(res: NextResponse, r: RateLimitResult): NextResponse {
  res.headers.set("X-RateLimit-Limit", String(r.limit));
  res.headers.set("X-RateLimit-Remaining", String(r.remaining));
  res.headers.set("X-RateLimit-Reset", String(Math.ceil(r.resetAt / 1000)));
  return res;
}

/**
 * Higher-Order: wickelt einen Route-Handler mit Rate-Limit ein.
 * Bei Überschreitung: 429 mit `Retry-After`-Header.
 */
export function withRateLimit<TReturn extends Response | NextResponse>(
  handler: (req: Request, ctx?: unknown) => Promise<TReturn> | TReturn,
  options: { scope: string; limit: number; windowMs: number }
): (req: Request, ctx?: unknown) => Promise<Response | NextResponse> {
  return async (req, ctx) => {
    const key = rateLimitKeyFromRequest(req, options.scope);
    const r = checkRateLimit(key, options.limit, options.windowMs);
    if (!r.ok) {
      const retryAfterSec = Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000));
      const res = NextResponse.json(
        { error: "Zu viele Anfragen. Bitte kurz warten." },
        { status: 429 }
      );
      res.headers.set("Retry-After", String(retryAfterSec));
      return applyRateLimitHeaders(res, r);
    }
    const result = await handler(req, ctx);
    // Nur NextResponse-Objekte bekommen Header; sonst durchreichen.
    if (result instanceof NextResponse) {
      return applyRateLimitHeaders(result, r);
    }
    return result;
  };
}
