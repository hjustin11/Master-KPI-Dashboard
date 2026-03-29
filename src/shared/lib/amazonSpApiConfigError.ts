import { NextResponse } from "next/server";

/**
 * Einheitliche 500-Antwort wenn SP-API-Pflichtvariablen fehlen (Orders/Products/Sales).
 */
export function amazonSpApiIncompleteJson(missing: Record<string, boolean>) {
  const missingKeys = (Object.entries(missing) as [string, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => k);

  const hint =
    "Auf Production (z. B. Vercel) unter Environment Variables für „Production“ (und ggf. Preview) setzen — oder dieselben Keys in Supabase-Tabelle integration_secrets. Für den Auslese-Fallback aus der DB braucht Vercel NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY. Sehr häufig fehlt in Production: AMAZON_SP_API_MARKETPLACE_ID (oder AMAZON_SP_API_MARKETPLACE_IDS).";

  return NextResponse.json(
    {
      error: "Amazon SP-API ist nicht vollständig konfiguriert.",
      missing,
      missingKeys,
      hint,
    },
    { status: 500 }
  );
}
