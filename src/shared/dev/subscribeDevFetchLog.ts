export type DevFetchLogPayload = {
  method: string;
  pathWithQuery: string;
  status?: number;
  ok?: boolean;
  ms: number;
  error?: string;
};

type Listener = (payload: DevFetchLogPayload) => void;

type PatchedFetch = typeof fetch & {
  __devFetchLogPatched?: true;
  __devFetchLogOriginal?: typeof fetch;
};

type DevFetchLogState = {
  originalFetch: typeof fetch;
  listeners: Set<Listener>;
  patched: boolean;
};

const DEV_FETCH_LOG_STATE_KEY = "__masterDashboardDevFetchLogState__";

function getState(): DevFetchLogState {
  const w = window as Window & {
    [DEV_FETCH_LOG_STATE_KEY]?: DevFetchLogState;
  };
  if (w[DEV_FETCH_LOG_STATE_KEY]) {
    return w[DEV_FETCH_LOG_STATE_KEY];
  }

  const currentFetch = window.fetch as PatchedFetch;
  const originalFetch = currentFetch.__devFetchLogOriginal ?? currentFetch.bind(window);
  const state: DevFetchLogState = {
    originalFetch,
    listeners: new Set<Listener>(),
    patched: false,
  };
  w[DEV_FETCH_LOG_STATE_KEY] = state;
  return state;
}

function shouldLogApiFetch(url: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return false;
    return u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function resolveRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): { method: string; url: string } {
  if (typeof input === "string") {
    return { method: (init?.method ?? "GET").toUpperCase(), url: input };
  }
  if (input instanceof URL) {
    return { method: (init?.method ?? "GET").toUpperCase(), url: input.toString() };
  }
  return {
    method: (init?.method ?? input.method ?? "GET").toUpperCase(),
    url: input.url,
  };
}

function pathWithQueryFromUrl(url: string): string {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://local");
    return `${u.pathname}${u.search}`;
  } catch {
    return url.slice(0, 120);
  }
}

function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const state = getState();
  const { method, url } = resolveRequest(input, init);
  const logThis = shouldLogApiFetch(url);
  const pathWithQuery = pathWithQueryFromUrl(url);
  const nf = state.originalFetch;
  if (!logThis) {
    return nf(input as RequestInfo, init);
  }
  const t0 = performance.now();
  return nf(input as RequestInfo, init)
    .then((res) => {
      const ms = Math.round(performance.now() - t0);
      const payload: DevFetchLogPayload = {
        method,
        pathWithQuery,
        status: res.status,
        ok: res.ok,
        ms,
      };
      state.listeners.forEach((l) => l(payload));
      return res;
    })
    .catch((err: unknown) => {
      const ms = Math.round(performance.now() - t0);
      const message = err instanceof Error ? err.message : String(err);
      const payload: DevFetchLogPayload = {
        method,
        pathWithQuery,
        ms,
        error: message,
      };
      state.listeners.forEach((l) => l(payload));
      throw err;
    });
}

/**
 * Abonniert Browser-`fetch` und meldet abgeschlossene Same-Origin `/api/*`-Requests.
 * Mehrfache Subscriber werden unterstützt; letzter Unsubscribe stellt `fetch` wieder her.
 */
export function subscribeDevFetchLog(listener: Listener): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const state = getState();
  if (!state.patched) {
    const wrapped = patchedFetch as PatchedFetch;
    wrapped.__devFetchLogPatched = true;
    wrapped.__devFetchLogOriginal = state.originalFetch;
    window.fetch = wrapped as typeof fetch;
    state.patched = true;
  }
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
    if (state.listeners.size === 0 && state.patched) {
      window.fetch = state.originalFetch;
      state.patched = false;
    }
  };
}
