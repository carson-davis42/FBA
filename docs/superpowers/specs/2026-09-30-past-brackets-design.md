# Past brackets for D2 and World Cup history

Status: design agreed with the user 2026-09-30. Branch `history-brackets`. Builds on part 3a (FBA past brackets, `PastBracket`), part 4 (D2 history) and part 5a (World Cup history).

## 1. Goal and decisions

The user wants to see the brackets of past D2 and World Cup seasons in the history tabs. Today none of the 25 D2 and 12 World Cup summaries holds a bracket.

- **Source:** the 140-page image PDF already used in 3a (`.superpowers/sdd/fba-brackets.pdf.url`, really a PDF). The page images are extracted to `.superpowers/sdd/history/allpages/pNNN.jpg` (git-ignored scratch; rebuild by scanning the PDF for JPEG streams). 3a transcribed only the FBA Elite Tournament pages and skipped these.
- **Coverage (user chose all, in stages):**
  - **World Cup:** 12 pages, S56–S78 (16-team brackets, flags beside names, series or single-game scores).
  - **D2 Tournament (old format):** 15 pages, S53–S67 ("FBA D2 Tournament", one bracket per season; S54 has no summary today, report it).
  - **D2 league tournaments:** about 40 pages, S68–S77, one per league (World, Premier, International, United League; some seasons have only three leagues). 8-team brackets with seeds, records and best-of series scores, season printed under the title.
  - D2 S78 keeps its live bracket (`summary.bracket`); S79 onward comes from the app.
  - A season with no bracket shows "No bracket recorded".
- **Stages, each mergeable on its own:** (1) schema and renderer changes plus the World Cup season page and the 12 World Cup brackets; (2) the old D2 Tournament pages and the D2 page section; (3) the D2 league tournaments.
- **Transcription:** Sonnet implementers read downscaled page images in batches of about 8 pages, writing text files in the 3a format (`# imgNNN` header, `S<n>`, seed|name|record lines, `=` result lines); `importers/history/convert-brackets.mjs`-style conversion builds the JSON (copy the 3a converter into `importers/history/` if it is not there; extend it for scores). Leading and trailing page numbers are the controller's job, not the implementer's.

## 2. Data

- `PastSeries` gains an optional `score: z.string().regex(/^\d+[–-]\d+$/)`: a single game's score (for example "97–75"). The winner then has `homeWins`/`awayWins` of 1 and 0 and the renderer shows the score instead of the win counts. Series scores ("4–2", the World Cup's "2–0") keep using the existing win fields. `PastBracket` validation (full binary tree, winner advances) is unchanged.
- `SummaryFile.pastBracket` stays: the one bracket for an FBA, World Cup or old-format D2 season. D2 S68–S77 gains `pastBrackets: z.array(z.object({ group: z.enum(['PL','WL','UL','IL']), bracket: PastBracket }).strict()).optional()` (one per league, group codes as in `engine/history/d2.ts`). `.superRefine` rejects both fields on one summary, `pastBrackets` outside `fbad2`, and a repeated group.
- Transcribed data is committed: `importers/history/wcBrackets.json` and `importers/history/d2Brackets.json` (D2 entries carry an optional `group`), each guarded by a test like `fbaBrackets.test.ts`: schema-valid, one entry per season (and group), and the bracket's champion and runner-up match the existing summary's titles for that season/group. A mismatch list like 3a's `ALLOWED_MISMATCH` starts empty; add an entry only with the user's approval.
- Sheet and app names are matched to the summary with the alias handling already in `importers/history.ts` (old names such as "Former Pirates" stay text, as in 3a).

## 3. Importers

`importers/run.ts` gains `--wc-brackets` and `--d2-brackets`, both requiring `--data <dir>`, in the style of `--wc-history`/`--d2-history`. Each reads the matching JSON, finds the season's `leagues/<league>/S<n>/summary.json`, sets `pastBracket` or `pastBrackets`, validates through the schema registry, and writes (skipping any season that already has one unless it is unchanged; report counts). Seasons without a summary are listed in the report, never created. Dry-run behaviour is the same as the other modes. The user runs them on real data; browser checks run only on scratch copies.

## 4. Pages

- **Renderer:** `app/history/PastBracket.tsx` shows `score` when present. It also needs to cope with 16-team (4-round) brackets and 8-team (3-round) ones; it already uses `bracket.rounds`.
- **World Cup season page (new):** `/history/fbawc/season/:season` (`app/history/wc/WcSeasonPage.tsx`, route in `Layout.tsx`): header (season, host city and country), champion, runner-up, Tournament MVP (`mvpName` text or `PlayerLink`), the bracket in `.table-wrap` or the bracket column layout used by `PastBracket`, with flags (`WcTeam`). Hub rows in `WcHistoryPage` link season labels to it. A played season without a bracket shows "No bracket recorded".
- **D2 season page** (`app/history/d2/D2SeasonPage.tsx`): a "Tournament" section. S78 and later keep the live `Bracket` by group; earlier seasons render `pastBracket` or each of `pastBrackets` under its league heading (`groupLabel`), else "No bracket recorded".
- Tables and brackets stay inside `.table-wrap`; use theme tokens; no horizontal page scroll at 375px; dark mode follows tokens.

## 5. Tests

- Schema tests (`score`, `pastBrackets`, conflicts); importer tests on a temp copy of fixture summaries (never `web/data`); JSON guard tests (valid, unique, champion/runner-up match); page tests (`cleanup()` in `afterEach`): WC season page with and without bracket, hub links, D2 season page with an old bracket, per-league brackets and none. `web/data.test.ts` stays green.
- Browser checks on a scratch copy (5183/5184, per CLAUDE.md): run the new import modes on the scratch data, then read pages by text and JS (at most 3 screenshots at scale 0.5; if the pane is hidden say so rather than claim layout checks).

## 6. Out of scope

FBAJC (March Madness and NIT pages in the PDF) is part 6. No change to `web/data`, the Java folders or logos. FBA brackets are unchanged.
