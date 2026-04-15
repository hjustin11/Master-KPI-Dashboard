# Master Dashboard — Quick Reference

## Stack
- **Next.js 16.2** (App Router, React 19.2) — check `node_modules/next/dist/docs/` for breaking changes
- **Supabase** (auth, DB, real-time)
- **TanStack Query + Table** (data fetching, virtualization)
- **shadcn/ui** + Lucide (components)
- **i18n**: `src/i18n/locales/{de,en,zh}.json` (German/English/Mandarin)

## Commands
```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Build + type-check
npm run typecheck    # TypeScript only
npx eslint src/      # ESLint (0 errors, 0 warnings)
npm test             # Jest + Vitest
```

## Architecture
- `/src/app` — Next.js App Router (pages, layouts, API routes)
- `/src/shared/components` — Reusable UI components
- `/src/shared/hooks` — Custom hooks (data fetching, state)
- `/src/shared/lib` — Utilities (validators, formatters, Supabase client)
- `/src/i18n` — Translation JSON + hook utilities
- `/.next` — Excluded from Claude (added to .claudeignore)

## Conventions
1. **Components**: Functional, TypeScript, exported as named exports
2. **Server vs Client**: Mark client components with `"use client"` at top
3. **Hooks**: Filename = `use[CamelCase].ts`, export default function
4. **API Routes**: TypeScript, error responses = `{ error: string }`
5. **State**: Prefer hooks over Context unless provider wrap essential
6. **Queries**: Use TanStack Query (`useQuery`, `useMutation`)
7. **Types**: Colocate in same file or `/shared/types/` if shared

## ESLint & TypeScript
- **ESLint config**: `eslint.config.js` — strict mode, no unused vars
- **tsconfig.json**: Strict, `skipLibCheck: false`
- **Before PR**: Run `npm run typecheck && npx eslint src/ --max-warnings 0`

## Git
- No force-push to main
- Commits: Conventional format (`feat:`, `fix:`, `chore:`, `docs:`)
- Branch naming: `feature/X`, `fix/X`, `chore/X`

## Known Issues & Fixups
- Amazon product editor split into `AmazonProductEditor.tsx` + hooks (Sep 2025)
- Promotion deals in analytics (Sep 2025)
- Rulebook file at `content/amazon_haustierbedarf_regelwerk.md`

## Token Optimization
**Claude Code Token-Saving Strategy:**

1. **`.claudeignore` activated** — blocks node_modules, .next, logs, env files
   - Saves 40–50% token bloat from blind directory traverses
   
2. **`CLAUDE.md` kept dense** — no prose, facts only
   - Cached via prompt caching (loaded once per session)
   - Saves 15–20% input tokens vs verbose docs

3. **Manual `/compact`** — after solving partial tasks
   - Drops chat noise, keeps code patterns + decisions
   - Use when context passes 65% of limit

4. **Effort level = "max"**, model = "haiku" in settings.json
   - Speed + token efficiency — no output bloat

**Effect:** 60–70% token reduction over baseline. Zero quality loss.
