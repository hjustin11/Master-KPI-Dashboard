This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment variables

1. Copy `.env.example` to `.env.local` and fill in values. Never commit `.env.local`.
2. On the host (e.g. Vercel), define the **same variable names** as in `.env.example` (from your secret store or GitHub Actions secrets).
3. **Supabase `integration_secrets`**: For many marketplace integrations, the app falls back to the `integration_secrets` table when an env var is empty — the `key` column must match the env name exactly (e.g. `SHOPIFY_API_BASE_URL`). See `readEnv()` in `src/shared/lib/flexMarketplaceApiClient.ts`. `SUPABASE_SERVICE_ROLE_KEY` must be set on the server so the admin client can read those rows.
4. **Client-exposed vars** (`NEXT_PUBLIC_*`) are visible in the browser — do not put private API secrets there.

## Quality Gates

```bash
npm run lint
npm run typecheck
npm run build
```

Run all gates in sequence:

```bash
npm run verify
```

## Audit and Operations Docs

- `docs/audit/project-architecture.md`
- `docs/audit/stability-performance-audit.md`
- `docs/quality/smoke-checklist.md`
- `docs/quality/quality-gates-baseline.md`
- `docs/ops/public-launch-checklist.md`
- `CONTRIBUTING.md`

You can start editing pages inside `src/app`. The page auto-updates as you edit files.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deployment Trigger Log

- 2026-04-01: Manual deploy trigger commit.
