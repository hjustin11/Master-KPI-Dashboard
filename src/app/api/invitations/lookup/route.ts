import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { type Role } from "@/shared/lib/invitations";
import { normalizeRoleKey } from "@/shared/lib/roles";
import { getClientIpFromHeaders, isRateLimited } from "@/shared/lib/serverRateLimit";

const LOOKUP_RATE_LIMIT = 30;
const LOOKUP_RATE_WINDOW_MS = 60_000;

function resolveRole(value: unknown): Role | null {
  return normalizeRoleKey(value);
}

export async function POST(request: Request) {
  try {
    const ip = getClientIpFromHeaders(request.headers);
    if (
      isRateLimited({
        key: `invite-lookup:${ip}`,
        limit: LOOKUP_RATE_LIMIT,
        windowMs: LOOKUP_RATE_WINDOW_MS,
      })
    ) {
      // Keep the response shape stable to avoid invitation enumeration.
      return NextResponse.json({ invited: false }, { status: 429 });
    }

    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase() ?? "";

    // Wichtig: bewusst keine harten Fehlermeldungen, um Enumeration nicht zu erleichtern.
    if (!email) {
      return NextResponse.json({ invited: false });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("invitations")
      .select("token,role,status,expires_at")
      .eq("email", email)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({
        invited: false,
        error: process.env.NODE_ENV !== "production" ? error?.message : undefined,
      });
    }

    const expiresAt = new Date(data.expires_at as string).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      return NextResponse.json({ invited: false });
    }

    const role = resolveRole(data.role);
    if (!role) {
      return NextResponse.json({ invited: false });
    }

    const inviteToken = String(data.token ?? "").trim();
    if (!inviteToken) {
      return NextResponse.json({ invited: false });
    }

    const inviteUrl = `/register?invite=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(
      email
    )}&role=${role}`;

    return NextResponse.json({ invited: true, role, inviteUrl });
  } catch (err) {
    return NextResponse.json(
      {
        invited: false,
        error:
          process.env.NODE_ENV !== "production"
            ? err instanceof Error
              ? err.message
              : "Unbekannter Fehler"
            : undefined,
      },
      { status: 200 }
    );
  }
}

