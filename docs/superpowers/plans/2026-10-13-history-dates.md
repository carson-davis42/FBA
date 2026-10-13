# History dates Implementation Plan

> For agentic workers: subagent-driven-development or executing-plans. Spec: `docs/superpowers/specs/2026-10-13-history-dates-design.md`. Branch `history-dates`.

## Global constraints
Never modify `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/`, `FBA Logos/`, `web/data/**` (importer code is written and tested on fixtures and scratch copies; the user runs real imports). Stage by explicit path. No dev servers. `npx tsc --noEmit` clean, full `npx vitest run` passing. Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Task 1: schemas, date formatting, clock
- `engine/shared/types.ts` (strict zod): `Champion.date` (`z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()`), the same `date` on the FBAJC national-championship and NIT entries of `JcSummary`, `DraftHistoryDraft.date`, `SummaryFile.span` (`{ opened, locked }` ISO datetimes, `.optional()`), `CalendarFile.startedAt` (ISO datetime, optional). `MoveContext.now?: string`.
- `engine/shared/dates.ts`: `formatDay(iso)` → `"Oct 12, 2026"`, `formatSpan(openedIso, lockedIso)` → `"Oct 1 – Oct 12, 2026"` / `"Dec 20, 2026 – Jan 4, 2027"`; UTC based, locale fixed to en-US; null/invalid → null.
- Tests: schemas accept and reject, the formatters (same year, across years, same day → one date).

### Task 2: sheet importers
Read the date columns with exceljs (cells are `Date`, UTC midnight; `X` or empty → null). Put each into the doc the existing mode already builds, matching by season (and league/tab):
- `--history` (FBA): main sheet Championships tab column "Date" → the FBA Champion entry of each season's summary.
- `--drafts`: each draft tab's date cell → `DraftHistoryDraft.date` (also the `S59 Exp` … `S75 exp` tabs).
- `--d2-history`: "D2 League Championships" per league (PL/WL/UL/IL) → that league's Champion entry; "D2 International Championships" (a season can have two: `S55(1)`, `S55(2)`) and "D2 World Cups" → their Champion entries (`fbawc` summaries for the World Cups).
- `--jc-history`: "National Championship History" and "NIT Championship History" → the JcSummary entries.
Each importer keeps its current behaviour when a date is missing. Quirk to respect: Excel sometimes stores a series score such as "2-1" as a date (Feb 1) in score columns; only the "Date" columns are read as dates.
Tests on small in-memory fixtures per importer (pure builder functions get a `dates` input). Do not run importers on real data or write `web/data`.

### Task 3: engine timestamps
- `nextSeasonDocs` writes `calendar.startedAt = ctx.now` for the new season (omitted without `now`); `finishSeason` writes `span = { opened: calendar.startedAt, locked: ctx.now }` only when both exist. Callers `app/pages/NextSeasonPage.tsx` and `app/playoffs/FinishSeasonCard.tsx` (and any other finish caller: JC, WC) pass `now: new Date().toISOString()`.
- Importer mode `--season-start <season> <ISO>` in `importers/run.ts` writing `calendar.startedAt` for the calendar of that season (refuse a different season, or an invalid date).
- Tests for the three pieces.

### Task 4: display
Show per H5 on: FBA `SeasonHistoryPage`, D2 season page, FBAJC season page, FBAWC season page (champion cards / playoffs card), and the FBA and D2 draft season pages (draft date, and the expansion draft's own date). Seasons with `span` show the span line; `date` shows the day. Tests: a summary with `date`, with `span`, with neither.
