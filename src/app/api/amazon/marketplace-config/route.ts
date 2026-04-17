import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { getAmazonMarketplacesWithDbStatus } from "@/shared/lib/amazon/marketplaceConfigDb";
import { isEntwicklerProfileRole } from "@/shared/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isEntwicklerProfileRole(profile?.role)) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const marketplaces = await getAmazonMarketplacesWithDbStatus();
  return NextResponse.json({ marketplaces });
}
