import type { NextRequest } from "next/server";

export const LOCAL_DEV_AUTH_COOKIE = "md_local_dev_user";

function readBoolEnv(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isLocalDevAuthEnabled(): boolean {
  return readBoolEnv(process.env.NEXT_PUBLIC_LOCAL_TEST_MODE);
}

export function isLocalHostName(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

export function allowedLocalOwnerEmails(): string[] {
  const raw = (process.env.NEXT_PUBLIC_LOCAL_OWNER_EMAILS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedLocalOwnerEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return allowedLocalOwnerEmails().includes(normalized);
}

export function resolveLocalDevEmailFromRequest(request: NextRequest): string | null {
  if (!isLocalDevAuthEnabled()) return null;
  if (!isLocalHostName(request.nextUrl.hostname)) return null;
  const cookieEmail = (request.cookies.get(LOCAL_DEV_AUTH_COOKIE)?.value ?? "").trim().toLowerCase();
  if (!cookieEmail) return null;
  return isAllowedLocalOwnerEmail(cookieEmail) ? cookieEmail : null;
}
