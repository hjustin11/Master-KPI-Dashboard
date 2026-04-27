# Custom Subagents — Master Dashboard

10 spezialisierte Reviewer-Agents (read-only). Sie prüfen Code aus jeweils einer Profi-Perspektive und liefern strukturierte Findings (BLOCKER / WARN / NIT) mit File-Pfad, Line-Number und Fix-Skizze.

## Agents im Überblick

| Agent | Perspektive | Wann |
|---|---|---|
| `security-reviewer` | OWASP, Secrets, Auth, RLS, SSRF, Injection | Vor jedem Merge auf main, nach API-/Auth-Änderung |
| `ops-reviewer` | Vercel/Supabase/CI Hygiene, Cron, Pool, Cold-Start | Nach Infra-/Deploy-/Cron-Änderung |
| `senior-engineer` | Architektur, Über-Engineering, Tech-Debt | Vor Refactors, bei Design-Entscheidungen |
| `performance-reviewer` | N+1, Waterfalls, Render-Thrash, Bundle | Nach Datenfetch-/Listen-Änderungen |
| `marketplace-integration` | Mirakl/Otto/Amazon-Quirks, Schema-Drift, Brand-Pollution | Nach Cross-Listing-/Dispatcher-Code |
| `accessibility-reviewer` | WCAG 2.1 AA, Keyboard, ARIA, Kontraste | Nach UI-Komponenten-Änderung |
| `db-migration-reviewer` | Locking, RLS, Indexes, Reversibility | Bei jedem `supabase/migrations/*.sql`-Diff |
| `i18n-reviewer` | Hardcoded Strings, Key-Drift, Locale-Format | Nach UI-Text-Änderung, neuen Keys |
| `api-route-reviewer` | Konventionen (Auth/Validation/Error/Cache) | Nach Änderung in `src/app/api/**/route.ts` |
| `frontend-ux-reviewer` | Loading/Empty/Error-States, Optimistic Updates | Nach Page-/Dashboard-Komponenten-Änderung |

## Aufruf

### Durch Claude (im Code-Flow)

Claude kann sie via `Agent`-Tool starten. Mehrere parallel:
> „Bevor wir pushen, lass `security-reviewer` + `ops-reviewer` + `marketplace-integration` parallel auf den Otto-Diff laufen."

### Manuell

`/agents` (Slash-Command in Claude Code) → Agent auswählen → Aufgabe formulieren.

## Konventionen

- **Read-only** — kein Agent darf editieren. Findings werden vom Haupt-Agent (Claude) umgesetzt.
- **Severity-Levels** einheitlich: BLOCKER (muss vor Merge raus), WARN (sollte), NIT (kann).
- **Stack-aware** — jeder Agent kennt CLAUDE.md, PROJECT_REVIEW.md, OTTO_LISTING_UPLOAD.md, die `.env.local`-Vars und die Memory-Files. Findings sind konkret, nicht generisch.
- **Anti-scope** — jeder Agent hat eine explizite "Don't audit X"-Liste. Verhindert Doppel-Findings.

## Modell

Default `sonnet` für alle. Falls ein bestimmter Agent in der Praxis flacher arbeitet als gewünscht, im YAML-Header auf `model: opus` ändern (langsamer, aber tiefere Analyse).

## Wartung

- **Heuristiken aktualisieren**: wenn ein neues Codebase-Pattern etabliert ist, im jeweiligen Agent unter „Heuristics specific to this codebase" ergänzen
- **Neue Agents**: `.claude/agents/<name>.md` mit gleichem Frontmatter-Format. Ergänze diese Tabelle.
- **Nicht in jedem PR alle 10 laufen lassen** — wähle 2–4 nach Diff-Inhalt, sonst Token-Verschwendung

## Hilfreiche Kombos

- **Marketplace-Upload-Diff**: `marketplace-integration` + `security-reviewer` + `i18n-reviewer`
- **Neue API-Route**: `api-route-reviewer` + `security-reviewer` + `ops-reviewer`
- **DB-Migration**: `db-migration-reviewer` + `security-reviewer` (RLS-Cross-Check)
- **Refactor / Architektur**: `senior-engineer` + `performance-reviewer`
- **UI-Page**: `frontend-ux-reviewer` + `accessibility-reviewer` + `i18n-reviewer` + `performance-reviewer`
