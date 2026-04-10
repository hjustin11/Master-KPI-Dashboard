import { NextResponse } from "next/server";
import {
  isAllowedLocalOwnerEmail,
  isLocalDevAuthEnabled,
  isLocalHostName,
  LOCAL_DEV_AUTH_COOKIE,
} from "@/shared/lib/localDevAuth";

function localDevAuthForbidden() {
  return NextResponse.json({ ok: false, error: "local_dev_auth_disabled" }, { status: 403 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!isLocalDevAuthEnabled() || !isLocalHostName(url.hostname)) {
    return localDevAuthForbidden();
  }
  const cookieHeader = request.headers.get("cookie") ?? "";
  const emailMatch = cookieHeader.match(new RegExp(`${LOCAL_DEV_AUTH_COOKIE}=([^;]+)`));
  const email = emailMatch ? decodeURIComponent(emailMatch[1] ?? "").trim().toLowerCase() : "";
  if (!email || !isAllowedLocalOwnerEmail(email)) {
    return NextResponse.json({ ok: true, user: null });
  }
  return NextResponse.json({
    ok: true,
    user: {
      id: `local-dev:${email}`,
      email,
      fullName: "Lokaler Entwickler",
      roleKey: "owner",
      profileRoleRaw: "owner",
    },
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!isLocalDevAuthEnabled() || !isLocalHostName(url.hostname)) {
    return localDevAuthForbidden();
  }

  let body: { email?: string } = {};
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!isAllowedLocalOwnerEmail(email)) {
    return NextResponse.json({ ok: false, error: "email_not_allowed" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(LOCAL_DEV_AUTH_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  if (!isLocalHostName(url.hostname)) {
    return localDevAuthForbidden();
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(LOCAL_DEV_AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0,
  });
  return response;
}
