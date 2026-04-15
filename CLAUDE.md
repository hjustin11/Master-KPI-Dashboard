# Master Dashboard — Quick Reference (Stand 2026-04-15, Post-Refactor)

## Stack
- **Next.js 16.2.1** (App Router, React 19.2.4) — Breaking-Changes ggü. 14/15, siehe AGENTS.md
- **Supabase** (Auth, DB, SSR via `@supabase/ssr` 0.9)
- **TanStack Query + Table** (Query unter-genutzt, Table gut genutzt)
- **shadcn/ui + Lucide** (25 Primitives generiert)
- **Tailwind 4**, **Zod 4.3**, **Zustand 5**, **Recharts 3**, **Vitest 4**
- **i18n**: `src/i18n/messages/{de,en,zh}.json`

## Commands
```bash
npm run dev          # Dev (Turbopack, :3000)
npm run build        # Prod-Build + type-check
npm run typecheck    # tsc --noEmit
npx eslint src/      # 0 errors, 0 warnings Gate
npm test             # Vitest (29 tests)
```

## Architektur (Post-Refactor)
- `/src/app` — Next.js App Router (Route Groups `(auth)`, `(dashboard)`)
- `/src/app/api` — 77 Route-Handler
- `/src/shared/components` — eigene UI (layout, charts, data, tutorial, auth, dev)
- `/src/shared/components/layout/sidebar/` — **NEU:** 9 Sub-Komponenten + 3 Hooks
- `/src/shared/hooks` — 22 Hooks (8 neu aus Refactor)
- `/src/shared/lib` — 97 Dateien Domänen-/Integrations-Logik (18 825 LOC)
- `/src/shared/stores/useAppStore.ts` — Zustand für Rollen/UI/WIP
- `/src/components/ui` — shadcn-Primitives
- `/src/i18n` — Eigenes Translation-Framework
- `/supabase/migrations` — 22 SQL-Migrations

## Thin-Orchestrator-Pattern (NEU)
Dashboard-Pages sind dünne Orchestratoren:
- **Page** (≤ 600 Z.) lädt Hooks, komponiert Sub-Komponenten.
- **`components/`-Nachbarordner** hält Präsentations-Komponenten.
- **Hooks in `src/shared/hooks/`** kapseln Fetch-/State-/Derived-Logik.

Referenzen:
- [analytics/marketplaces/page.tsx](src/app/(dashboard)/analytics/marketplaces/page.tsx) (582 Z.)
- [xentral/orders/page.tsx](src/app/(dashboard)/xentral/orders/page.tsx) (610 Z.)
- [analytics/article-forecast/page.tsx](src/app/(dashboard)/analytics/article-forecast/page.tsx) (325 Z.)
- [shared/components/layout/AppSidebar.tsx](src/shared/components/layout/AppSidebar.tsx) (181 Z.)

## Konventionen
1. **Components**: Functional + TypeScript, named exports.
2. **Server vs. Client**: `"use client"` oben bei Client-Components.
3. **Hooks**: Dateiname `use[CamelCase].ts`, `export default function`.
4. **API-Routen**: Error-Format `{ error: string }`, Zod via `apiValidation.ts`.
5. **State**: Zustand (`useAppStore`) global; useState lokal; TanStack Query für Server-State.
6. **Auth in API**: `createServerSupabase()` (session) oder `createAdminClient()` (service-role, nie Client).
7. **Secrets**: nur via `readIntegrationSecret()` / `readIntegrationSecretsBatch()`.
8. **Cache**: Server via `integrationDataCache.ts`; Browser via `dashboardClientCache.ts` (localStorage).
9. **i18n**: Nie harte Strings. `t("key")` aus `useTranslation()`.
10. **Types**: Colocate oder in `src/shared/types/`.

## Qualitäts-Gates (PR-pflichtig)
```bash
npm run typecheck && npx eslint src/ --max-warnings 0 && npm run build && npm test
```

## Git
- Kein Force-Push auf main
- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`)
- Nach jedem Refactor-Schritt committen, nicht batchen

## Bekannte Probleme
- **Supabase Connection-Pool = 10** → keine 9-fach-Parallelität, max 3; Aggregator `/api/analytics/marketplace-overview` existiert
- **Xentral `?includeSales=1`** bis 115 s → nie auf UX-Pfaden
- **`.next/`** wächst → gelegentlich `rm -rf .next`

## Offene Schulden (Kurzfassung, vollständig in PROJECT_REVIEW.md §15)
1. Rate-Limit-Lib (`rateLimit.ts`) flächendeckend verdrahten
2. `withAuth(roleFilter)`-HOF für API-Routen
3. `apiValidation.ts` (Zod) in allen POST/PUT-Routen
4. Test-Coverage ausbauen (aktuell 4 Unit-Tests)
5. Env-Validator at startup
6. Nächste Refactor-Runde: `AmazonProductEditor.tsx` (1 097 Z.), `flexMarketplaceApiClient.ts` (1 018 Z.), `ottoApiClient.ts` (952 Z.)
7. `useBackgroundSyncedResource<T>` extrahieren (3 Loader duplizieren Muster)
8. `any` (14×) zurückbauen
9. `console.log` (19×) durch Structured Logger ersetzen
10. `src/features/` (leer) entweder nutzen oder löschen

## Token-Optimierung
- `.claudeignore` aktiv (blockt node_modules, .next, logs, env)
- `CLAUDE.md` dicht gehalten (Facts, keine Prosa)
- `/compact` nach Teilaufgaben
