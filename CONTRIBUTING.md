# Contributing Guidelines

## Workflow

1. Create a feature/fix branch from `main`.
2. Keep changes small and scoped.
3. Open a pull request with:
   - problem statement
   - risk assessment
   - verification notes

## Required Checks

Before requesting review:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- run relevant smoke checks from `docs/quality/smoke-checklist.md`

## Review Rules

- At least one reviewer required for all PRs.
- API, auth, and shared-lib changes should include explicit rollback notes.
- Avoid broad refactors mixed with behavior changes.

## Stability Policy

- Prefer low-risk incremental changes.
- Do not change UI/theme as part of stability/performance work unless explicitly requested.
- Document non-obvious operational impacts in PR description.
