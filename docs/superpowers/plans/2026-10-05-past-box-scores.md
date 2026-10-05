# Past box scores plan

> Execute inline (executing-plans). Spec: `docs/superpowers/specs/2026-10-05-past-box-scores-design.md`. Never modify `web/data/**`; run from `web/`: `npx vitest run`, `npx tsc --noEmit`.

1. **Engine** `web/engine/history/seasonRoster.ts` (+ test): export `stintSeasons` from `franchiseRoster.ts`; add `rosterFromBios(kind: 'd2' | 'wc' | 'college', teamName, season, { players, bios })` returning `{ playerId, name, honours: string[] }[]` sorted by name. Commit.
2. **Bracket links** `PastBracket.tsx` (+ test): optional `gameLink?: (seriesId: string) => string`; a box with both sides becomes a `Link` (class `series-link`); CSS in `history.css`. Widen `BugSide.score` to `number | string`. Commit.
3. **Page** `app/history/BoxScorePage.tsx` (+ test) and the route in `app/shell/Layout.tsx`. Commit.
4. **Wire the season pages** (FBA, D2 incl. group brackets, FBAJC mm and nit, World Cup) to pass `gameLink`. Browser check on the dev server, read-only. Commit.
