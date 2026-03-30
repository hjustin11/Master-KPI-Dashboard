type RateWindow = {
  startMs: number;
  count: number;
};

const globalStoreKey = "__master_dashboard_rate_limit_store__";

function getStore(): Map<string, RateWindow> {
  const g = globalThis as Record<string, unknown>;
  const existing = g[globalStoreKey];
  if (existing instanceof Map) {
    return existing as Map<string, RateWindow>;
  }
  const created = new Map<string, RateWindow>();
  g[globalStoreKey] = created;
  return created;
}

export function isRateLimited(args: {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
}): boolean {
  const now = args.nowMs ?? Date.now();
  const store = getStore();
  const current = store.get(args.key);

  if (!current || now - current.startMs >= args.windowMs) {
    store.set(args.key, { startMs: now, count: 1 });
    return false;
  }

  if (current.count >= args.limit) {
    return true;
  }

  current.count += 1;
  store.set(args.key, current);
  return false;
}

export function getClientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-vercel-forwarded-for")?.trim() ||
    "unknown"
  );
}
