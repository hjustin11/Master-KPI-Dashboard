import { NextResponse } from "next/server";
import { withAuth } from "@/shared/lib/apiAuth";

export const dynamic = "force-dynamic";

/**
 * Image-Proxy für Marktplatz-Medien-Downloads. **Authentifiziert** (jeder
 * eingeloggte User) + **SSRF-gehärtet**:
 *   - HTTPS-Pflicht
 *   - Block für private/loopback/link-local-IPs (RFC 1918, ::1, fe80::/10, …)
 *   - Optionale Host-Allowlist via `IMAGE_PROXY_ALLOWED_HOSTS` (Komma-Liste,
 *     Suffix-Match wie `media-amazon.com`). Leer = alle externen Hosts erlaubt.
 *
 * Vorher: offene SSRF-Falle (kein Auth, kein Host-Filter) → an attacker
 * mit Cookie eines beliebigen Users konnte interne Vercel-/Supabase-/Cloud-
 * Metadaten-Endpoints lesen.
 */

function isPrivateOrLocal(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "metadata.google.internal" || h === "169.254.169.254") return true;
  // IPv4
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map((s) => Number.parseInt(s, 10));
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b! >= 16 && b! <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true;
  }
  // IPv6 (grobe Approximation — Vercel-Edge braucht keine perfekte Coverage)
  if (h.startsWith("[")) {
    const inner = h.slice(1, -1).toLowerCase();
    if (inner === "::1" || inner === "::") return true;
    if (inner.startsWith("fe80:") || inner.startsWith("fc") || inner.startsWith("fd")) return true;
  }
  return false;
}

function isHostAllowed(host: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const h = host.toLowerCase();
  return allowlist.some((suffix) => {
    const s = suffix.trim().toLowerCase();
    if (!s) return false;
    return h === s || h.endsWith(`.${s}`);
  });
}

export const GET = withAuth(async ({ req: request }) => {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url") ?? "";
  const filename = searchParams.get("filename") ?? "bild.jpg";

  if (!url || !/^https:\/\//i.test(url)) {
    return NextResponse.json({ error: "Ungültige URL — HTTPS erforderlich." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "URL konnte nicht geparst werden." }, { status: 400 });
  }

  if (isPrivateOrLocal(parsed.hostname)) {
    return NextResponse.json(
      { error: "Privater oder lokaler Host ist nicht erlaubt." },
      { status: 400 }
    );
  }

  const allowlistRaw = (process.env.IMAGE_PROXY_ALLOWED_HOSTS ?? "").trim();
  const allowlist = allowlistRaw
    ? allowlistRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  if (!isHostAllowed(parsed.hostname, allowlist)) {
    return NextResponse.json(
      { error: `Host ${parsed.hostname} ist nicht in IMAGE_PROXY_ALLOWED_HOSTS.` },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(parsed.toString(), { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Bild konnte nicht geladen werden (${res.status}).` },
        { status: 502 }
      );
    }

    const blob = await res.blob();
    const headers = new Headers();
    headers.set("Content-Type", blob.type || "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
    headers.set("Cache-Control", "no-store");

    return new NextResponse(blob, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Download fehlgeschlagen." }, { status: 500 });
  }
});
