# Project Architecture Overview

## Purpose

`master-dashboard` is a central operations dashboard and hub for multiple employees.
It consolidates marketplace, ERP, analytics, procurement, and collaboration workflows into one interface.
The primary goals are:

- Shared daily operations across teams.
- Reliable data access and workflows.
- Production readiness for public deployment.

## Runtime Stack

- Next.js App Router (`next@16`)
- React (`react@19`)
- TypeScript (`strict` mode)
- Supabase (auth + data)
- Tailwind + shadcn/base-ui components

## High-Level Structure

- App routes: `src/app`
  - Dashboard routes: `src/app/(dashboard)`
  - Auth routes: `src/app/(auth)` and `src/app/auth`
  - Backend-for-frontend API handlers: `src/app/api/**/route.ts`
- Shared logic: `src/shared`
  - API clients and domain logic: `src/shared/lib`
  - Reusable components: `src/shared/components`
  - App-wide hooks/stores/types
- Localization: `src/i18n/messages` + `src/i18n/I18nProvider.tsx`

## Auth and Access Model

- Middleware gate: `middleware.ts`
  - Verifies Supabase user for non-public routes.
- Role and permissions logic:
  - `src/shared/lib/access-control.ts`
  - `src/shared/hooks/usePermissions.ts`
- Admin-level Supabase access is used by API routes via:
  - `src/shared/lib/supabase/admin.ts`

## Data Flow

1. Browser requests route.
2. `middleware.ts` checks authentication/session.
3. Client components call internal API routes (`/api/...`).
4. API routes fetch external marketplace/Xentral data and/or Supabase data.
5. Responses are transformed in shared libraries and rendered in dashboard pages.

## Caching and Sync Patterns

- Client cache helper:
  - `src/shared/lib/dashboardClientCache.ts`
- Background refresh via interval exists in major dashboard pages.
- Selective local persistence (localStorage) is used for some views.
- File-based cache exists for Xentral delivery-sales sync:
  - `src/shared/lib/xentralDeliverySalesCache.ts`

## Critical Surfaces

- Auth + route guard behavior: `middleware.ts`
- Large integration routes:
  - `src/app/api/xentral/orders/route.ts`
  - `src/app/api/marketplaces/price-parity/route.ts`
  - `src/app/api/analytics/marketplace-article-sales/route.ts`
- High-load client views:
  - `src/app/(dashboard)/analytics/marketplaces/page.tsx`
  - `src/app/(dashboard)/xentral/orders/page.tsx`
  - marketplace `orders/page.tsx` pages

## Collaboration/Operations Context

- The dashboard is used by multiple employees concurrently.
- Stability and predictable behavior are more important than feature velocity.
- Public deployment requires stronger operational guardrails:
  - release gates, security hardening, and performance controls.
