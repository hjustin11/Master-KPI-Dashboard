import { NextResponse } from "next/server";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import { getIntegrationCachedOrLoad } from "@/shared/lib/integrationDataCache";
import {
  buildXentralOrdersCacheKey,
  computeXentralOrdersPayload,
  XentralOrdersPayloadError,
  XENTRAL_ORDERS_CACHE_FRESH_MS,
  XENTRAL_ORDERS_CACHE_STALE_MS,
} from "@/shared/lib/xentralOrdersPayload";

async function resolveXentralConfig() {
  const baseUrl = await getIntegrationSecretValue("XENTRAL_BASE_URL");
  const token =
    (await getIntegrationSecretValue("XENTRAL_PAT")) || (await getIntegrationSecretValue("XENTRAL_KEY"));
  return { baseUrl, token };
}

export async function GET(request: Request) {
  const { baseUrl, token } = await resolveXentralConfig();

  if (!baseUrl || !token) {
    return NextResponse.json(
      {
        error:
          "Xentral ist nicht konfiguriert. Bitte Env Vars setzen oder Supabase Tabelle 'integration_secrets' befüllen.",
        missing: {
          XENTRAL_BASE_URL: !baseUrl,
          XENTRAL_PAT_or_KEY: !token,
        },
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const bypassCache =
    searchParams.get("refresh") === "1" || process.env.XENTRAL_ORDERS_CACHE_DISABLE === "1";

  try {
    const payload = bypassCache
      ? await computeXentralOrdersPayload(request, baseUrl, token)
      : await getIntegrationCachedOrLoad({
          cacheKey: buildXentralOrdersCacheKey(searchParams),
          source: "xentral:orders",
          freshMs: XENTRAL_ORDERS_CACHE_FRESH_MS,
          staleMs: XENTRAL_ORDERS_CACHE_STALE_MS,
          loader: () => computeXentralOrdersPayload(request, baseUrl, token),
        });
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof XentralOrdersPayloadError) {
      return NextResponse.json(e.body, { status: e.status });
    }
    throw e;
  }
}
