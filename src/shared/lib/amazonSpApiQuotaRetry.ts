/**
 * Amazon Selling Partner API: 429 / QuotaExceeded — erneuter Aufruf mit frischer SigV4-Signatur.
 */

export type AmazonSpApiGetResult = {
  res: Response;
  text: string;
  json: unknown;
};

export function amazonSpApiSleepMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const t = header.trim();
  if (!t) return null;
  const asNum = Number(t);
  if (Number.isFinite(asNum) && asNum >= 0) {
    return Math.min(120_000, asNum * 1000);
  }
  const httpDate = Date.parse(t);
  if (Number.isFinite(httpDate)) {
    const delta = httpDate - Date.now();
    return delta > 0 ? Math.min(120_000, delta) : null;
  }
  return null;
}

function jsonHasQuotaExceeded(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const errors = (json as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return false;
  return errors.some(
    (e) =>
      e &&
      typeof e === "object" &&
      String((e as { code?: unknown }).code).toLowerCase() === "quotaexceeded"
  );
}

/** Nur für Fehlerantworten: erneut versuchen nach Wartezeit. */
export function amazonSpApiResponseIsRetriableQuota(args: { status: number; json: unknown }): boolean {
  if (args.status === 429) return true;
  if (args.json && typeof args.json === "object" && jsonHasQuotaExceeded(args.json)) return true;
  return false;
}

/**
 * `executeSignedGet` pro Versuch neu aufrufen (neuer x-amz-date / Signatur).
 * `max429Retries`: maximale Zusatzversuche nach einem 429/QuotaExceeded (wie flex MAX_429_RETRIES).
 */
export async function amazonSpApiGetWithQuotaRetry(
  executeSignedGet: () => Promise<AmazonSpApiGetResult>,
  options: { max429Retries: number }
): Promise<AmazonSpApiGetResult> {
  const cap = Math.min(30, Math.max(0, Math.floor(options.max429Retries)));
  for (let attempt = 0; ; attempt += 1) {
    const out = await executeSignedGet();
    const retriable =
      !out.res.ok && amazonSpApiResponseIsRetriableQuota({ status: out.res.status, json: out.json });
    if (!retriable) {
      return out;
    }
    if (attempt >= cap) {
      return out;
    }
    const fromHeader = parseRetryAfterMs(out.res.headers.get("Retry-After"));
    const backoff = Math.min(120_000, 2000 * 2 ** attempt);
    const jitter = Math.floor(Math.random() * 500);
    await amazonSpApiSleepMs((fromHeader ?? backoff) + jitter);
  }
}
