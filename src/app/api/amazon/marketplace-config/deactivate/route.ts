import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { isEntwicklerProfileRole } from "@/shared/lib/roles";
import {
  getAmazonMarketplaceBySlug,
  DEFAULT_AMAZON_SLUG,
} from "@/shared/config/amazonMarketplaces";
import { setAmazonMarketplaceEnabled } from "@/shared/lib/amazon/marketplaceConfigDb";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as { slug?: string } | null;
  const slug = (body?.slug ?? "").trim();
  const marketplace = getAmazonMarketplaceBySlug(slug);
  if (!marketplace) {
    return NextResponse.json({ error: `Unbekannter Slug: ${slug}` }, { status: 400 });
  }
  if (slug === DEFAULT_AMAZON_SLUG) {
    return NextResponse.json(
      { error: "Amazon Deutschland kann nicht deaktiviert werden." },
      { status: 400 }
    );
  }
  await setAmazonMarketplaceEnabled(slug, false);
  return NextResponse.json({ ok: true, slug });
}
