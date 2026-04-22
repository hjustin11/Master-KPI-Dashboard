import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { isOwnerFromSources } from "@/shared/lib/roles";
import { translateAmazonListingContent } from "@/shared/lib/amazon/contentTranslator";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

async function getCurrentUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { user, supabase };
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const { data: profile } = await currentUser.supabase
    .from("profiles")
    .select("role")
    .eq("id", currentUser.user.id)
    .maybeSingle();
  const isOwner = isOwnerFromSources({
    profileRole: profile?.role,
    appRole: currentUser.user.app_metadata?.role,
    userRole: currentUser.user.user_metadata?.role,
  });
  if (!isOwner) {
    return NextResponse.json({ error: "Nur Owner darf übersetzen." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    source?: {
      title?: string;
      description?: string;
      bulletPoints?: string[];
      brand?: string;
    };
    sourceLanguageTag?: string;
    targetLanguageTag?: string;
    productContext?: {
      category?: string;
      productType?: string;
      brand?: string;
    };
  } | null;

  if (!body?.source || !body.sourceLanguageTag || !body.targetLanguageTag) {
    return NextResponse.json(
      { error: "source, sourceLanguageTag und targetLanguageTag sind Pflicht." },
      { status: 400 }
    );
  }

  const result = await translateAmazonListingContent({
    source: body.source,
    sourceLanguageTag: body.sourceLanguageTag,
    targetLanguageTag: body.targetLanguageTag,
    productContext: body.productContext,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    content: result.content,
    model: result.model,
    sourceLanguageTag: body.sourceLanguageTag,
    targetLanguageTag: body.targetLanguageTag,
  });
}
