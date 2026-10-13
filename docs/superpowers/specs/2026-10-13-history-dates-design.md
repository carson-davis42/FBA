# Real-life dates in history, and the span of app-played seasons

Imported seasons show the real-life date the sheets give for their playoffs, drafts and finals. Seasons played in the app show how long the season ran: when it was started and when it was locked.

## Decisions
| # | Decision |
|---|---|
| H1 | **Sheet dates imported** (all that the cached sheets hold): FBA Finals (main sheet, Championships tab, "Date" column, S57 on; `X` = unknown), FBA and expansion drafts (draft sheet: one date per draft tab, S57–S79), D2 league finals by league (D2 history, "D2 League Championships", S68 on), D2 International Championships and D2 World Cups, FBAJC national championship and NIT finals (FBAJC history). |
| H2 | **Where they live.** A `date: string | null` (ISO `YYYY-MM-DD`, UTC) on each `Champion` entry of a summary (so the Finals, each D2 league final, the International Championship and the World Cup each carry theirs), the same on the FBAJC national-championship and NIT entries of `JcSummary`, and `date` on each `DraftHistoryDraft`. Optional in the schemas so existing docs stay valid; the importers set it, `null` when the sheet says `X` or has none. |
| H3 | **App seasons.** `SummaryFile.span?: { opened: string; locked: string }` (ISO UTC datetimes). `opened` is when "Go to next season" started that season (stored as `CalendarFile.startedAt` when the calendar is created), `locked` is the moment that league's "Finish season" was pressed. Each league's summary has the same `opened` and its own `locked`. |
| H4 | **Clock.** Engine moves stay pure: `MoveContext` gets optional `now?: string`; the two callers (Finish season, Go to next season) pass `new Date().toISOString()`. Without `now`, no date is written. |
| H5 | **Display.** Next to a season's playoffs/championship card (FBA, D2, FBAJC, FBAWC season pages): "Finals: Oct 12, 2026" (long month, no weekday); for an app season "Oct 1 – Oct 12, 2026" (the year once if both ends are in it, both years otherwise). Drafts pages show the draft date next to the season heading. Nothing is shown when the date is null or absent. |
| H6 | **S79 backfill.** S79 was started before `startedAt` existed: its value is set once by hand-run importer mode `--season-start 79 <ISO>` (writes `calendar.json`), with a suggested value taken from the commit history of `leagues/fba/S79/rosters.json`. |

## Out of scope
Dates for individual regular-season games or transactions, the World Cup qualifying, past All-Star weekends, and time zones other than UTC dates.
