import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { type Role } from "@/shared/lib/invitations";

function resolveRole(value: unknown): Role | null {
  if (
    value === "owner" ||
    value === "admin" ||
    value === "manager" ||
    value === "analyst" ||
    value === "viewer"
  ) {
    return value;
  }
  return null;
}

export async function POST(request: Request) {
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
    return NextResponse.json({ invited: false });
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
}

