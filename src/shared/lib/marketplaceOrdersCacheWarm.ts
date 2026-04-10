import { fetchFressnapfOrdersPaginated, getFressnapfIntegrationConfig } from "@/shared/lib/fressnapfApiClient";
import { fetchKauflandOrderUnitsAllStatuses, getKauflandIntegrationConfig } from "@/shared/lib/kauflandApiClient";
import { fetchOttoOrdersRange, getOttoAccessToken, getOttoIntegrationConfig } from "@/shared/lib/ottoApiClient";
import { ymdRangeInclusiveDayCountLocal, ymdToUtcRangeExclusiveEnd } from "@/shared/lib/orderDateParams";

export type MiscMarketplaceOrdersWarmResult = {
  otto?: { ok: true; windows: Array<{ days: number; count: number; durationMs: number }> } | { ok: false; error: string };
  kaufland?: { ok: true; count: number; durationMs: number } | { ok: false; error: string };
  fressnapf?: { ok: true; windows: Array<{ days: number; count: number; durationMs: number }> } | { ok: false; error: string };
};

/**
 * Otto / Kaufland / Fressnapf: Integration-Cache für Bestellungen vorwärmen.
 * Flex-Marktplätze (Zooplus, eBay, Shopify, TikTok, MediaMarkt-Saturn) laufen separat über
 * `primeFlexOrdersCaches` in `api/integration-cache/warm` (FLEX_SPECS) — hier nicht duplizieren.
 */
export async function primeMiscMarketplaceOrdersCaches(
  dayWindows: number[]
): Promise<MiscMarketplaceOrdersWarmResult> {
  const out: MiscMarketplaceOrdersWarmResult = {};
  const windows = dayWindows
    .map((d) => Math.min(Math.max(Math.floor(d), 1), 60))
    .filter((d, i, a) => a.indexOf(d) === i);

  const ottoCfg = await getOttoIntegrationConfig();
  if (ottoCfg.clientId && ottoCfg.clientSecret) {
    const winResults: Array<{ days: number; count: number; durationMs: number }> = [];
    try {
      const token = await getOttoAccessToken({
        baseUrl: ottoCfg.baseUrl,
        clientId: ottoCfg.clientId,
        clientSecret: ottoCfg.clientSecret,
        scopes: ottoCfg.scopes,
      });
      for (const days of windows) {
        const started = Date.now();
        const { fromYmd, toYmd } = ymdRangeInclusiveDayCountLocal(days);
        const { startMs, endMs } = ymdToUtcRangeExclusiveEnd(fromYmd, toYmd);
        const orders = await fetchOttoOrdersRange({
          baseUrl: ottoCfg.baseUrl,
          token,
          startMs,
          endMs,
          fromYmd,
          toYmd,
          forceRefresh: true,
        });
        winResults.push({ days, count: orders.length, durationMs: Date.now() - started });
      }
      out.otto = { ok: true, windows: winResults };
    } catch (e) {
      out.otto = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const kfCfg = await getKauflandIntegrationConfig();
  if (kfCfg.clientKey && kfCfg.secretKey) {
    try {
      const started = Date.now();
      const units = await fetchKauflandOrderUnitsAllStatuses({ config: kfCfg, forceRefresh: true });
      out.kaufland = { ok: true, count: units.length, durationMs: Date.now() - started };
    } catch (e) {
      out.kaufland = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const fnCfg = await getFressnapfIntegrationConfig();
  if (fnCfg.baseUrl && fnCfg.apiKey) {
    const winResults: Array<{ days: number; count: number; durationMs: number }> = [];
    try {
      for (const days of windows) {
        const started = Date.now();
        const { fromYmd, toYmd } = ymdRangeInclusiveDayCountLocal(days);
        const orders = await fetchFressnapfOrdersPaginated(fnCfg, {
          fromYmd,
          toYmd,
          forceRefresh: true,
        });
        winResults.push({ days, count: orders.length, durationMs: Date.now() - started });
      }
      out.fressnapf = { ok: true, windows: winResults };
    } catch (e) {
      out.fressnapf = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return out;
}
