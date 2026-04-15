import type { NextConfig } from "next";

// Zentrale Env-Validierung. Wird hier bewusst importiert, damit der Next-Server beim
// Start sofort ungültige Konfigurationen meldet, nicht erst beim ersten Request.
// `SKIP_ENV_VALIDATION=1` umgeht die Pflichtprüfungen (z. B. für `next build` auf CI ohne Secrets).
import "./src/shared/lib/env";

/**
 * Muss mit `src/shared/lib/navSectionRoots.ts` (SECTION_ROOT_REDIRECT_TARGET) übereinstimmen.
 * Kein Import aus `src/`, sonst warnt Turbopack beim Config-Trace.
 */
const SECTION_ROOT_REDIRECTS: Array<{ source: string; destination: string }> = [
  { source: "/amazon", destination: "/amazon/orders" },
  { source: "/ebay", destination: "/ebay/orders" },
  { source: "/otto", destination: "/otto/orders" },
  { source: "/kaufland", destination: "/kaufland/orders" },
  { source: "/fressnapf", destination: "/fressnapf/orders" },
  { source: "/mediamarkt-saturn", destination: "/mediamarkt-saturn/orders" },
  { source: "/zooplus", destination: "/zooplus/orders" },
  { source: "/tiktok", destination: "/tiktok/orders" },
  { source: "/shopify", destination: "/shopify/orders" },
  { source: "/xentral", destination: "/xentral/products" },
  { source: "/advertising", destination: "/advertising/campaigns" },
  { source: "/analytics", destination: "/analytics/marketplaces" },
  { source: "/settings", destination: "/settings/users" },
];

const isDev = process.env.NODE_ENV !== "production";

// CSP: Dev braucht 'unsafe-eval' (HMR/Turbopack) und ws: (Hot-Reload-Socket).
// Prod entfällt 'unsafe-eval'. 'unsafe-inline' bei script-src wegen Next.js Inline-Bootstraps + style-src wegen Tailwind/shadcn.
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel.app${isDev ? " ws: http://localhost:* ws://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "manifest-src 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
];

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives.join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async redirects() {
    return SECTION_ROOT_REDIRECTS.map((r) => ({
      source: r.source,
      destination: r.destination,
      permanent: false,
    }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
