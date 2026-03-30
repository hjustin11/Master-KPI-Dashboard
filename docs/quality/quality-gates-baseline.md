# Quality Gates Baseline

## Commands

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Current Baseline (Audit Run)

- `typecheck`: passing
- `build`: passing (with non-blocking build warnings)
- `lint`: passing (currently with warnings only)

## Notable Lint Warning Themes

- `@next/next/no-img-element` in multiple pages/components.
- `@typescript-eslint/no-unused-vars` in a few files.
- selected `react-hooks/exhaustive-deps` warnings.

## Policy for Stabilization Work

- No broad auto-fix during this audit pass.
- Address lint errors in controlled batches to avoid regressions.
- CI workflow still enforces gates for future clean-up trajectory.
