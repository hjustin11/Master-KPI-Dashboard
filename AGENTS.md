<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Stack-Fakten (Stand 2026-04-15)
- **Next.js 16.2.1** · **React 19.2.4** · **TypeScript strict** · **Tailwind 4** · **Zod 4.3** · **Supabase-SSR 0.9** · **Vitest 4.1**
- 394 TS/TSX-Dateien, 67 606 LOC, 77 API-Routen, 22 Supabase-Migrations
- Deploy: Vercel · DB/Auth: Supabase · Cron: Vercel (`/api/integration-cache/warm` alle 30 min)

## Thin-Orchestrator-Pattern (verbindlich seit Refactor 2026-04-15)
Dashboard-Pages halten **keine** Fetch-/State-/Derive-Logik. Muster:
1. **Page** (`src/app/(dashboard)/.../page.tsx`, ≤ 600 Z.) — `"use client"`, importiert Hooks + Sub-Komponenten, komponiert UI.
2. **Sub-Komponenten** (`components/`-Nachbarordner der Page) — pure Presenter.
3. **Hooks** (`src/shared/hooks/use*.ts`) — Fetch+Cache (`useXxxLoader`), API-State (`useXxxRules`), Derived-Memos (`useXxxComputed`).

Referenz-Implementierungen: [analytics/marketplaces/page.tsx](src/app/(dashboard)/analytics/marketplaces/page.tsx), [analytics/article-forecast/page.tsx](src/app/(dashboard)/analytics/article-forecast/page.tsx), [xentral/orders/page.tsx](src/app/(dashboard)/xentral/orders/page.tsx), [shared/components/layout/AppSidebar.tsx](src/shared/components/layout/AppSidebar.tsx).

## Harte Regeln
- **Client-Components**: `"use client"` oben.
- **Auth in API**: `createServerSupabase()` aus `@/shared/lib/supabase/server`. Service-Role nur `createAdminClient()` aus `@/shared/lib/supabase/admin`. Nie im Client.
- **Secrets**: ausschließlich `readIntegrationSecret()` / `readIntegrationSecretsBatch()` aus `@/shared/lib/integrationSecrets`. Niemals direkt auf `integration_secrets`-Tabelle.
- **Cache**: Server via `integrationDataCache.ts`, Browser via `dashboardClientCache.ts`. Nie Tabelle/localStorage direkt.
- **Rollen-Check**: `isOwnerFromSources()` aus `@/shared/lib/roles` (DB + app_metadata + user_metadata).
- **Supabase Connection-Pool = 10** — max. 3 parallele Calls im selben Request-Scope.
- **i18n**: Keine harten Strings. `t("key")` aus `useTranslation()`. Alle drei Locales (`de`/`en`/`zh`) pflegen.
- **Error-Format API**: `NextResponse.json({ error: string }, { status })`.
- **Zod-Validierung**: `src/shared/lib/apiValidation.ts` (`parseRequestBody`, `parseSearchParams`, `parseFormFields`).

## Nie anfassen (ohne Rücksprache)
- `middleware.ts` Public-Path-Allowlist (Auth-Sicherheit).
- `useAppStore` Persist-Version ohne Migration-Handling.
- Direkte DB-Schema-Änderung ohne Migration in `supabase/migrations/`.
- `integration_secrets`-Tabelle direkt.
- `src/features/` (tote Zone, aktuell ungenutzt).

## Wo neuer Code hingehört
| Ziel | Pfad |
|---|---|
| Neue Marktplatz-Integration | `src/shared/lib/{name}ApiClient.ts` + `src/app/api/{name}/…` + (Mirakl) `flexMarketplaceApiClient.ts`-Spec |
| Neues Dashboard-Feature | `src/app/(dashboard)/{feature}/page.tsx` + `components/`-Nachbarordner + Hook(s) in `src/shared/hooks/` |
| Neues API-Endpoint | `src/app/api/{domain}/{verb}/route.ts` mit Zod-Validierung + `{ error }`-Format |
| Neue Tabelle | `supabase/migrations/{YYYYMMDDHHmmss}_{name}.sql` mit RLS-Policy |
| Neuer Sidebar-Eintrag | `src/shared/components/layout/sidebar/navItems.ts` + Rollen-Sichtbarkeit in `useAppStore` |
| Neuer Loader-Hook | **Erst prüfen**: kann `useBackgroundSyncedResource<T>` (geplant) das leisten? Sonst an `useArticleForecastLoader` / `useMarketplaceSalesLoader` / `useXentralOrdersLoader` orientieren |

## Qualitäts-Gates (verpflichtend)
```
npm run typecheck && npx eslint src/ --max-warnings 0 && npm run build && npm test
```
Nach jedem Schritt committen, nicht batchen. Aktuell: 29/29 Tests grün, 0 Warnings, Build erfolgreich.

## Bekannte Workarounds
- Xentral `?includeSales=1` dauert bis 115 s → nicht synchron auf UX-Pfaden.
- Analytics-Page feuert 9 parallele Calls → Concurrency-3-Drossel aktiv; Server-Aggregator `/api/analytics/marketplace-overview` existiert als Alternative.
- `integration_data_cache` ohne RLS — keine User-Daten dort speichern.
- `.next/` wächst auf mehrere GB — regelmäßig `rm -rf .next`.

## Offene Haupt-Schulden (Kurzfassung, Details in PROJECT_REVIEW.md §15)
1. Rate-Limiter flächendeckend (`rateLimit.ts` existiert, kaum verdrahtet)
2. `withAuth(roleFilter)`-HOF (30 Routen duplizieren Auth-Check)
3. Zod-Adoption in allen POST/PUT-Routen
4. Test-Coverage (aktuell 4 Unit-Tests)
5. Env-Validator at startup
6. Nächste Refactor-Runde: `AmazonProductEditor.tsx` (1 097 Z.), `flexMarketplaceApiClient.ts` (1 018 Z.), `ottoApiClient.ts` (952 Z.), `xentralOrdersPayload.ts` (752 Z.)
7. `useBackgroundSyncedResource<T>` extrahieren
8. `any` (14×) / `console.log` (19×) aufräumen
9. `src/features/` nutzen oder löschen
