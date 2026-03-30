# Public Launch Checklist

## 1) Configuration and Secrets

- Set required Supabase variables.
- Set `XENTRAL_DELIVERY_SALES_SYNC_SECRET` in production.
- Verify marketplace API credentials are present and valid.
- Ensure `.env` values are not committed.

## 2) Security Controls

- Verify middleware access rules in `middleware.ts`.
- Verify service-role usage only in server routes.
- Confirm invitation lookup rate limiting is active.
- Confirm sync endpoints are fail-closed in production.

## 3) Reliability

- Run quality gates:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
- Run `docs/quality/smoke-checklist.md`.
- Verify critical APIs return expected status codes under error conditions.

## 4) Performance

- Validate hidden-tab polling suppression (no unnecessary background traffic).
- Check heavy analytics routes for acceptable response time.
- Confirm large table routes remain responsive with realistic dataset sizes.

## 5) Team Process

- Use PR-based workflow for all production changes.
- Require CI success before merge.
- Require at least one reviewer for API/shared-lib changes.
- Keep release notes for each deploy (what changed, rollback path).

## 6) Rollback Readiness

- Confirm previous stable deployment reference is known.
- Ensure DB migration order and rollback notes are documented.
- Prepare emergency toggle/disable plan for unstable integrations.
