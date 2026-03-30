# Stability and Performance Audit

## Scope

- Whole project review.
- Priorities: stability/fault tolerance first, then performance.
- Constraint: no UI/theme redesign.

## Priority Findings

### P0

1. **Missing automated merge gate (CI workflow)**
   - Impact: regressions can reach production without lint/type/build checks.
   - Action: add required CI pipeline with lint/typecheck/build.

2. **Sync endpoint auth fallback behavior**
   - File: `src/app/api/xentral/delivery-sales-cache/sync/route.ts`
   - Impact: if sync secret is not configured correctly, unauthorized triggering risk increases.
   - Action: require secret in production and fail closed.

### P1

1. **No dedicated typecheck script**
   - Impact: weaker consistency in local/CI quality gates.
   - Action: add `npm run typecheck` (`tsc --noEmit`).

2. **Public invite lookup has no rate limiting**
   - File: `src/app/api/invitations/lookup/route.ts`
   - Impact: abuse/traffic spikes and easier probing behavior.
   - Action: add conservative in-memory IP rate limiter.

3. **Env docs can drift from code requirements**
   - Impact: production misconfiguration risk.
   - Action: document and validate required vars for sync/auth-critical paths.

### P2

1. **Background polling runs even in hidden tabs**
   - Impact: unnecessary backend load and client/network churn.
   - Action: skip polling when document is not visible.

2. **Large non-paginated table surfaces**
   - Impact: DOM/render pressure for heavy datasets.
   - Action: keep under observation and add per-view guardrails where needed.

## Applied Improvement Policy

- Only low-risk, incremental changes.
- No visual changes.
- Every change must be verifiable with `lint`, `typecheck`, and `build`.

## Verification Matrix

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Residual Risks to Track

- Heavy integration routes under peak load.
- Service-role usage surface area in API handlers.
- Rate limiting that is process-local (works as first layer, not global).
