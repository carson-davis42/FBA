# Franchise history: past team names, era logos and finals cards

This small part follows the site look. It goes on branch `import-logos`, next to the `--logos` import mode, and merges with it.

**Problem.** History pages show a logo only when a name in the history matches a current team's name exactly. Nine old franchise names never match ("Montreal", "San Antonio", "St.Louis", "Former Pirates", "Cypress Black Sox", "Cal Tech Knights", "Cal Tech Golden Knights", "Charlotte Knights", and the typo "Denver Height"), so they show as plain text. The logos for those eras already exist on disk in each franchise's folder (e.g. `Montreal Chevaliers/Montreal S12-S56.png`). Also, seasons S1–S51 have no imported bracket, so their Playoffs tab shows no bracket at all, although each summary has the champion, runner-up, score, Finals MVP and both conference champions.

**Source of truth.** The FBA team history sheet (`1_oz7ULZMsaFInj-ncqs8qUm_5UBBNffJM_x9_ZOvQFU`, xlsx export, about 75 MB) has one tab per franchise, named by team id (`ATL` … `VEG`, plus `LAL` and `PHI`, which start in S80). Column A of each tab lists the franchise's name eras, newest first. Each era is a block of four cells: name, abbreviation, `(City, Region)`, and a range (`S41-S56` or `S73-pres.`). Two further tabs ("Teams By Season", "Champions By Season") are out of scope.

## Decisions

| # | Decision |
|---|---|
| F1 | **Name eras are imported from the sheet**, not hand-copied. New import mode `npm run import -- --franchises`. |
| F2 | **One new document,** `leagues/fba/franchises.json`, with a strict zod schema and a path rule. It is the only file the mode writes. |
| F3 | **Names resolve by name and season.** "Texas Outlaws" in S10 is the Montreal franchise (MON); from S41 it is Texas (TEX). |
| F4 | **A summary's own `teamId` wins** over the name lookup when it has one. |
| F5 | **A resolved team shows the name as recorded that season** (e.g. "Montreal", "Cal Tech Knights"), with that season's logo from its franchise folder. Unresolved names stay plain text. |
| F6 | **A season without an imported bracket shows one bracket-style Finals card** in its Playoffs tab. |
| F7 | **Tolerant lookup:** the sheet has small gaps and overlaps (MON has no S11 era; CHI lists S49 twice; SEA has no S77). If no era covers the season, the nearest era with that exact name is used. If two eras cover the season, the one that starts later wins. |
| F8 | **One alias**, "Denver Height" → "Denver Heights", is a typo in the bracket source. It lives in the engine lookup, not the data. |

## 1. Import mode `--franchises`

- `importers/sheets/franchises.ts`: `parseFranchiseTab(teamId, rows): { eras, problems }`, a pure function. It scans column A for range cells matching `^S(\d+)-(S(\d+)|pres\.?)$`. The three cells above a range are its name, abbreviation and `(City, Region)`, with the parentheses stripped. A block missing any of the four is reported as a problem and skipped.
- `importers/run.ts`: `importFranchises()` downloads the workbook (cached in `web/importers/.cache`), reads every tab whose name is a bare id (no spaces), parses each one, and validates the result against the schema. It writes only `<data>/leagues/fba/franchises.json`, where `<data>` is `web/data` by default or the folder given with `--data <dir>` (the same flag `--history` uses), so checks can target a scratch copy.
- The command prints the franchise count, the era count, a warning for each parse problem, and a note for each tab id not in `leagues/fba/teams.json` (expected for LAL and PHI). Schema failure or zero franchises means an error exit, and nothing is written.
- `--logos` takes the same optional `--data <dir>`, so a scratch copy's logo list can be rebuilt for browser checks.
- README: one line under the other import modes.

## 2. Schema

In `engine/shared/types.ts`:

```ts
export const FranchiseEra = z.object({
  name: z.string().min(1), abbr: z.string().min(1), city: z.string().min(1),
  from: int.min(1), to: int.min(1).nullable(),   // null = to the present
}).strict();
export const FranchisesFile = z.object({
  franchises: z.array(z.object({ teamId: z.string().min(1), eras: z.array(FranchiseEra).min(1) }).strict()),
}).strict();
```

Refinement: `to` is null or ≥ `from`. Path rule `^leagues/fba/franchises\.json$` in `schemaRegistry.ts`. The committed `web/data` has no such file, so `data.test.ts` is unaffected. The file is optional everywhere: without it, pages behave as today.

## 3. Lookup

`engine/shared/franchises.ts`:

- `franchiseAt(file: FranchisesFile | null, name: string, season: number): { teamId: string; era: FranchiseEra } | null`. Apply the F8 alias. Among eras with exactly that name, take the covering era (F7 tie rule), else the nearest by season distance, else null.
- `resolveHistoryTeam(teams, franchises, name, season, teamId?)`: returns `{ team: Team; name: string; abbr: string } | null`. With `teamId` (F4), the team is found by id. Otherwise the team comes from `franchiseAt`'s `teamId`, else an exact match on a current name. `name` and `abbr` come from the matched era when it belongs to that team (so a typo such as "Denver Height" shows as "Denver Heights"), else the recorded name and the team's abbreviation. With no franchises file, it falls back to today's exact match on the current name.

## 4. UI

- `useFbaTeams()` (in `app/history/useTeams.tsx`) also loads `leagues/fba/franchises.json` through `useDoc`. A missing or unreadable file means `null` and never an error page. It exposes a `resolve(name, season, teamId?)` helper built on `resolveHistoryTeam`.
- `TeamName` gains optional `name` and `abbr` props that replace `team.name` and `team.abbr` in the displayed text and title. Past brackets show abbreviations, and those change by era ("FP", "SOX", "CT"). Existing callers are unchanged.
- Pages that switch from exact name match to `resolve`: `PastBracket`, the championships timeline (champion and runner-up), the season page (the hero's theme and logo; its title stays the recorded champion name) and the Finals card. The championships timeline's "West · East" line stays plain text. The player page's career stints are out of scope. They already key on team codes.
- **Finals card** (`app/history/FinalsCard.tsx`): rendered by the season page's Playoffs panel when `pastBracket` is absent and `champions[0]` exists. It reuses the bracket matchup classes from `playoffs/playoffs.css`: a `series-box finals` with two `series-side` rows. The rows are the champion and the runner-up, each labelled with its conference from `confChampions` when the name matches (else no label). Each row shows the era logo and name via `resolve`, and wins from `score` split on the en dash or hyphen (winner first). The winner row carries the winner classes, and the loser is muted. The champion `Badge` sits on the card as in the Finals box of the brackets. The existing "Finals MVP: <name>" line under the Playoffs panel stays and is not repeated in the card. Above the card, a muted line: "The full bracket for S<n> wasn't recorded."
- Styling uses tokens only; no new colours.

## 5. Testing

- `parseFranchiseTab`: a CAR-style fixture with four eras, newest first, gives the four eras in sheet order, with correct `from`/`to` and `null` for `pres.`. A block with a missing abbreviation is reported and skipped.
- `franchiseAt`: "Texas Outlaws" S10 → MON and S50 → TEX. "Montreal" S30 → MON. "Denver Height" S74 → DEN. "Montreal" S11 (a gap) → MON via nearest. An unknown name → null. A null file → null.
- `resolveHistoryTeam`: a given `teamId` wins, and the label is the recorded name. With no franchises file, the result is the current exact-match behaviour.
- `FinalsCard`: winner and loser rows, wins parsed from "2–0" and "4-1", conference labels, the champion badge, the Finals MVP, and the note.
- History pages: `PastBracket` and the championships page show a logo and the recorded name for "Montreal" when franchises are loaded, and plain text without them. The season page shows the Finals card for a season without `pastBracket` and the bracket for one with it.
- Browser check (scratch data only, 5183/5184): run `npm run import -- --franchises --data <scratch data folder>`, then check S20 (Finals card, San Antonio over Former Pirates with era logos), S54 (past bracket with St.Louis and Cypress Black Sox logos), the championships timeline, 375px and dark.

## Out of scope

- The "Teams By Season" and "Champions By Season" tabs.
- Showing era names on current-season pages, player careers or awards history.
- The S80 expansion teams (LAL, PHI) in `teams.json`.
- Extracting the sheet's embedded logos. The needed logo files are already in `FBA Logos/`.
