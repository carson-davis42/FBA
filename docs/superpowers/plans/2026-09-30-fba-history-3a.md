# Part 3a FBA Season History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pick the Finals, Series and YSG MVPs in the app. Import S1–S78 FBA history, with transcribed brackets, into the season summaries. Show it on the Championships, Awards, Season and Players pages.

**Architecture:**
- **Engine:** pure code.
  - `engine/history/` builds the view rows and honours from `SummaryFile[]`.
  - The MVP moves live in `engine/playoffs/moves.ts` and `engine/allstar/youngStars.ts`.
- **Importer:** the parsers are in `importers/sheets/history.ts`, the assembly is in `importers/history.ts`, and the CLI flag is `--history` in `importers/run.ts`. The user runs it.
- **Pages:** they live in `app/history/`. They read `useHistory('fba')`, plus `players.json`, `leagues/fba/playerBios.json` and the FBA `teams.json` through `useDoc`.

**Tech Stack:** TypeScript 5, React 18, React Router 6, zod 3, Vitest 2 (jsdom), ExcelJS.

Spec: `docs/superpowers/specs/2026-09-30-fba-history-3a-design.md`. Its decisions are cited as H1–H12.

## Global Constraints

**Commands and data:**
- Run everything from `web/`. `npx tsc --noEmit` must print nothing.
- Filter test output: `npx vitest run <paths> 2>&1 | grep -E "Test Files|Tests|FAIL"`. Before this part the suite is 1132 tests.
- Never touch `web/data/**`, `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/` or `FBA Logos/`. Don't start or stop servers on 5173/5174. Never run the importer without `--data <scratch dir>`.

**Scratch inputs**, in `.superpowers/sdd/history/` (git-ignored; never commit them):
- `fba-pages/img*.jpg`: the 46 FBA bracket pages.
- `main/xl/**` and `st/xl/**`: the main and past-standings sheets as raw XML.
- `dump.cjs`: prints a tab's rows. Usage: `node dump.cjs <dir> <sheetN> <fromRow> <toRow> <maxCols>`.
  - For the main sheet: `sheet2` is Players, `sheet8` Championships, `sheet9` Awards and `sheet10` All-FBA Teams.

**Code rules:**
- Vitest globals are off: import `describe/it/expect/vi/afterEach` explicitly. Each jsdom test file calls `cleanup()` in `afterEach`.
- Page tests follow `app/pages/D2RatingsPage.test.tsx`: a stubbed `fetch` serves docs with ETags and records the PUT/batch bodies.
- `useSaving()` forces an extra render when a save starts, so guard every save handler with a `useRef` (see `app/playoffs/FinishSeasonCard.tsx`).
- New schema fields are optional, so the committed `web/data` keeps passing `data.test.ts`.
- Scores are shown through `formatScore()` (Task 5).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Files

| File | Responsibility |
|---|---|
| `engine/shared/types.ts`, `engine/shared/schemaRegistry.ts` (modify) | New fields, `PastBracket`, `PastAllFbaTeams`, `PlayerBiosFile`, the bios path |
| `engine/allstar/youngStars.ts`, `app/allstar/EventSteps.tsx` (modify) | YSG MVP |
| `engine/playoffs/moves.ts`, `engine/season/wrapUp.ts` (modify) | Finals and Series MVP moves, the finish gate, wrap-up fields |
| `app/playoffs/FinalsMvpCard.tsx` (create), `app/playoffs/PlayoffsPage.tsx` (modify) | The pick card |
| `server/storage.ts`, `server/handler.ts`, `app/api.ts` (modify) | The validated history list with `errors` |
| `engine/history/format.ts` (create) | `formatScore` |
| `importers/sheets/history.ts` (create) | Pure tab parsers |
| `importers/history.ts` (create), `importers/run.ts` (modify) | Name matching, player adding, summary assembly, `--history` |
| `importers/history/fbaBrackets.json`, `importers/history/championships.fixture.json` (create) | The transcription and its check fixture |
| `app/playoffs/Bracket.tsx` (modify), `app/history/PastBracket.tsx` (create) | Bracket rendering |
| `engine/history/views.ts`, `engine/history/honours.ts` (create) | Rows, the player index, honours |
| `app/history/*.tsx` (create), `app/shell/Layout.tsx` (modify) | The five routes |

---

### Task 1: Schemas

**Files:** modify `web/engine/shared/types.ts`, `web/engine/shared/schemaRegistry.ts`, `web/engine/shared/types.test.ts`, `web/engine/shared/schemaRegistry.test.ts`.

**Produces:**
- **`Champion`** gains `finalsMvp: playerId.nullable().optional()`.
- **`PlayoffsFile.outcome.champions[]`** gains `finalsMvp: playerId.nullable().optional()`.
- **`AllStarFile.ysg`** gains `mvp: playerId.optional()` and `mvpRollOff: RollOff.nullable().optional()`.
- **`SummaryAllStar`** gains optional `asgWinner`, `asgLoser` and `ysgWinner` (`z.string().min(1).nullable().optional()`), and `ysgMvp: playerId.nullable().optional()`.
- **`SummaryStanding`:** `confW`, `confL` and `diff` become `.nullable()`.
- **`SummaryFile`** gains:
  - `confChampions: z.object({ E: z.string().min(1).nullable(), W: z.string().min(1).nullable() }).strict().nullable().optional()`;
  - `pastBracket: PastBracket.nullable().optional()`;
  - `allFba` switches to `PastAllFbaTeams.nullable().optional()`.
- **New exports:**
  - `PastSide`, `PastSeries`, `PastBracket`;
  - `PastAllFbaSlot`, `PastAllFbaTeams`, `PAST_ALL_FBA_ORDERS`;
  - `PlayerBio`, `PlayerBiosFile`.
- **The registry** gets a rule for `leagues/fba/playerBios.json`, using `PlayerBiosFile`.

```ts
export const PAST_ALL_FBA_ORDERS = [
  ['G', 'F', 'C', 'ANY', 'ANY'], ['G', 'G', 'F', 'F', 'C'], ['OUT', 'MID', 'M2', 'IN'], ['OUT', 'MID', 'IN', 'ANY'],
] as const;
export const PastAllFbaSlot = z.object({
  slot: z.enum(['G', 'F', 'C', 'ANY', 'OUT', 'MID', 'M2', 'IN']),
  playerId: z.string().min(1).nullable(),
  teamId: z.string().min(1).nullable(),
}).strict();
export const PastAllFbaTeams = z.object({ team1: z.array(PastAllFbaSlot), team2: z.array(PastAllFbaSlot) }).strict()
  .refine(t => {
    const key = (xs: { slot: string }[]) => xs.map(s => s.slot).join(',');
    return key(t.team1) === key(t.team2) && PAST_ALL_FBA_ORDERS.some(o => o.join(',') === key(t.team1));
  }, 'Both All-FBA teams must follow the same known slot order');

export const PastSide = z.object({ name: z.string().min(1), record: z.string().regex(/^\d+-\d+(-\d+)?$/).nullable(), seed: int.min(1).max(16).nullable() }).strict();
export const PastSeries = z.object({
  id: z.string().regex(/^R\d-\d+$/),
  round: int.min(1).max(5),
  home: PastSide.nullable(),
  away: PastSide.nullable(),
  homeWins: int.min(0).max(4),
  awayWins: int.min(0).max(4),
  winner: z.enum(['home', 'away']),
}).strict();
export const PastBracket = z.object({ rounds: int.min(1).max(5), series: z.array(PastSeries) }).strict().superRefine((b, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const byId = new Map(b.series.map(s => [s.id, s]));
  for (let r = 1; r <= b.rounds; r++) {
    const n = 2 ** (b.rounds - r);
    for (let k = 1; k <= n; k++) if (!byId.has(`R${r}-${k}`)) issue(`Missing R${r}-${k}`);
  }
  if (byId.size !== b.series.length) issue('Series ids must be unique');
  for (const s of b.series) {
    if (Number(s.id[1]) !== s.round) issue(`${s.id}: round doesn't match its id`);
    const win = s[s.winner];
    const lose = s[s.winner === 'home' ? 'away' : 'home'];
    if (!win) { issue(`${s.id}: the winner can't be a BYE`); continue; }
    if (!s.home && !s.away) issue(`${s.id}: both sides are BYEs`);
    if (!lose && (s.homeWins || s.awayWins)) issue(`${s.id}: a BYE series has no wins`);
    if (lose && s[`${s.winner}Wins`] <= s[s.winner === 'home' ? 'awayWins' : 'homeWins']) issue(`${s.id}: the winner needs more wins`);
    if (s.round < b.rounds) {
      const k = Number(s.id.split('-')[1]);
      const next = byId.get(`R${s.round + 1}-${Math.ceil(k / 2)}`);
      const side = next?.[k % 2 === 1 ? 'home' : 'away'];
      if (next && side?.name !== win.name) issue(`${s.id}: ${win.name} should advance to ${next.id}`);
    }
  }
});
export const PlayerBio = z.object({ playerId: z.string().regex(/^p\d{5}$/), born: z.string(), entries: z.array(z.string().min(1)) }).strict();
export const PlayerBiosFile = z.object({ league: z.literal('fba'), bios: z.array(PlayerBio) }).strict()
  .refine(f => new Set(f.bios.map(b => b.playerId)).size === f.bios.length, 'Each player has one bio');
```

`AwardsFile` keeps `AllFbaTeams`. Fix any tsc errors caused by the nullable standings fields by rendering `—` for null.

- [ ] **Step 1: Write the failing tests.**
  - **`PastBracket`:**
    - The 8-team S54 tree parses (3 rounds; R1: St.Louis 6-1 seed 1 over Former Pirates 3-4 seed 8, 2–0, and so on; build it in a helper).
    - A 2-round tree with `R1-1` home `NO`, away null, winner home, 0–0 parses.
    - It is rejected: when a winner doesn't advance; when a BYE series has wins; when `R2-1` is missing; when the winner has fewer wins.
  - **`PastAllFbaTeams`:** accepts each of the four orders; rejects `team1` G/F/C/ANY/ANY with `team2` OUT/MID/IN/ANY.
  - **`SummaryFile`:**
    - accepts a standing with `confW: null, confL: null, diff: null`, `confChampions`, `pastBracket`, the new `allStar` fields and `champions[0].finalsMvp`;
    - the existing S78 fixture still parses.
  - **`PlayerBiosFile`:** rejects a duplicate `playerId`.
  - **The registry:** `schemaForPath('leagues/fba/playerBios.json')` is `PlayerBiosFile`.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc, `data.test.ts` and the full suite.**
- [ ] **Step 5: Commit** `feat: history schemas (past brackets, past All-FBA, bios, MVP fields)`.

---

### Task 2: YSG MVP (H11)

**Files:** modify `web/engine/allstar/youngStars.ts`, `web/app/allstar/EventSteps.tsx` and their tests (the YSG tests are likely in `engine/allstar/part2.test.ts`; grep `runYoungStar` to confirm; and `app/allstar/EventSteps.test.tsx`).

**Produces:** `ysgMvp(ysg: { semis: TeamGame[]; final: TeamGame; champion: number }, rng: Rng): { mvp: string; mvpRollOff: RollOff | null }`. `runYoungStar` stores its result in `ysg`.

The rule: add up `total(roll.dice)` over every `DiceRoll` in `semis[0]`, `semis[1]` and `final` whose `team === champion`. The top total wins. A tie goes to `rollOff(tiedIds, rng)` from `engine/allstar/dice.ts`: `mvp = order[0]`, and `mvpRollOff` is set. Call it after the final, so earlier random draws are unchanged.

- [ ] **Step 1: Write the failing tests.**
  - **Hand-built games:**
    - Champion team 2; P1 scores 7 + 9 = 16 across the semi and final, and P2 scores 12 in the final only. The MVP is P1 and `mvpRollOff` is null.
    - A player on another team scoring 30 is ignored.
    - A 16–16 tie gives a non-null `mvpRollOff`, and the MVP is one of the two.
  - **`runYoungStar`** with a seeded `mulberry32` sets `ysg.mvp` to a champion-team member.
  - **`EventSteps`:**
    - The YSG step lists `YSG MVP: <name>`, and the weekend results list shows `Young-Star champions: Team X · MVP <name>`.
    - A doc without `ysg.mvp` shows no MVP text.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: automatic YSG MVP`.

---

### Task 3: Finals and Series MVP moves and wrap-up (H10, H12)

**Files:** modify `web/engine/playoffs/moves.ts`, `web/engine/season/wrapUp.ts`, `web/engine/playoffs/moves.test.ts` and `web/engine/season/wrapUp.test.ts` (grep for the wrap-up test file name).

**Interfaces:**
- **Consumes:** Task 1 fields; `finalId(league, group)` and `FINALS` from `engine/playoffs/bracket.ts`; `playerName(state, id)` from `engine/season/state.ts`.
- **Produces:**
  - `finalsMvpCandidates(state: SeasonState, group: string | null): { playerId: string; name: string; gp: number; ppg: number }[]`
  - `pickFinalsMvp(state: SeasonState, group: string | null, playerId: string): SeasonResult`, with label `Pick the Finals MVP` or `Pick the <League> Series MVP`.
  - `finishSeason` refuses until each champion has a pick.
  - `seasonRecord` writes `champions[].finalsMvp` and the new `allStar` fields.

**Rules:**
- **The final's series id** is `FINALS` for the FBA (`group` null) and `finalId('fbad2', group)` for the D2.
- **Candidates:**
  - The final is the `state.playoffs.games` with that `seriesId`.
  - For each game, take the box side (`box.home` or `box.away`) whose team (`g.home` or `g.away`) is the champion's `teamId`.
  - `gp` counts games with a line, and `ppg = round1(pts / gp)`.
  - Sort by `ppg` descending, then by name.
  - With no outcome or no champion for that group, return `[]`.
- **`pickFinalsMvp` problems:**
  - `No champion yet` (no outcome or no champion for that group);
  - `The season is finished` (`state.summary` is set);
  - `<name> didn't play in the final` (not a candidate).
- **When it succeeds**, it replaces that champion's `finalsMvp` in `state.playoffs`. `changed` is `['playoffs']`, or whatever `SeasonDocKey` the playoffs doc uses; check `lockSeeds`.
- **`finishSeason` problems:**
  - For the FBA, when `finalsMvp` is missing on the FBA champion: `Pick the Finals MVP first`.
  - For the D2, when any champion's `finalsMvp` is missing: `Pick every Series MVP first`.
- **`seasonRecord`:**
  - `champions[].finalsMvp = c.finalsMvp ?? null`.
  - `allStar` adds:
    - `asgWinner: a.asg ? \`Team ${playerName(state, a.selections.captains[a.asg.game.winner])}\` : null`;
    - `asgLoser` from the other captain;
    - `ysgWinner: a.ysg ? \`Team ${playerName(state, a.selections.youngCaptains[a.ysg.champion])}\` : null`;
    - `ysgMvp: a.ysg?.mvp ?? null`.
  - Check `asg.game.winner` against the ASG team order used in `EventSteps.tsx` line ~194 (`teams[t][0]` is the captain) and use the same index.

- [ ] **Step 1: Write the failing tests** on the playoffs fixtures (`engine/playoffs/testFixtures.ts`):
  - **Candidates:** on a finished FBA bracket with box lines, only champion players are listed, `gp` and `ppg` are right (for example 3 games, 61 pts gives 20.3), and the rows are sorted.
  - **`pickFinalsMvp`:**
    - A valid pick sets it; picking again replaces it.
    - Each problem, one test apiece.
    - A D2 group picks only for its own champion.
  - **`finishSeason`:** refuses without the picks, with the exact texts, and succeeds with them.
  - **`seasonRecord`:** writes `finalsMvp`, `asgWinner`, `asgLoser`, `ysgWinner` and `ysgMvp`, and gives nulls when the All-Star doc has no `asg` or `ysg`.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.** Update any existing wrap-up and e2e tests that finish a season so they pick first; `season.e2e.test.ts` must still pass.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: Finals and Series MVP picks; wrap-up saves All-Star results`.

---

### Task 4: Finals MVP card

**Files:** create `web/app/playoffs/FinalsMvpCard.tsx`; modify `web/app/playoffs/PlayoffsPage.tsx` and `web/app/playoffs/PlayoffsPage.test.tsx`.

**Consumes:** `finalsMvpCandidates` and `pickFinalsMvp` (Task 3); `commitSeason(r, versions)` as in `PlayoffsPage.tsx:86`.

**The card:** `<FinalsMvpCard state versions group />` is rendered inside the champion card, once per `outcome.champions` entry, before `FinishSeasonCard`.
- **Heading:** `Finals MVP` for the FBA, `<groupLabel> Series MVP` for the D2.
- **Table:** Player, GP and PPG (`ppg.toFixed(1)`), with a `Pick` button per row.
  - The picked row shows `Finals MVP` (or `Series MVP`) in place of its button.
  - The other buttons stay, so the pick can be changed.
- **After wrap-up** (`state.summary` is set), it shows only `Finals MVP: <name>` (or `<League> Series MVP: <name>`), or nothing when there's no pick.
- **Saving:** the save is guarded with a `useRef`, and problems are shown in `<p className="error">`.

- [ ] **Step 1: Write the failing tests.**
  - **FBA:** a finished bracket shows the Finals MVP table sorted by PPG. Clicking Pick posts one batch whose playoffs doc has the champion's `finalsMvp`. A double click posts once.
  - **Finish:** clicking Finish without a pick shows `Pick the Finals MVP first`.
  - **D2:** there is one card per league champion, headed `Premier League Series MVP` and so on (use the real `groupLabel`).
  - **Summary set:** only the MVP line is shown.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: Finals and Series MVP pick card`.

---

### Task 5: History endpoint validation and `formatScore` (H5, H6)

**Files:** modify `web/server/storage.ts`, `web/server/handler.ts`, `web/server/storage.test.ts`, `web/server/handler.test.ts` and `web/app/api.ts`; create `web/engine/history/format.ts` and `web/engine/history/format.test.ts`.

**Produces:**
- **`storage.history(league)`** returns `{ seasons: unknown[]; errors: { season: number; message: string }[] }`.
  - For each file: `JSON.parse` in a try, then `SummaryFile.safeParse`. Import `SummaryFile` from `../engine/shared/types`, the same way the server already imports the registry.
  - A failure goes to `errors` with message `bad JSON` or the first issue as `<path>: <message>`.
- **The handler** sends `{ league, seasons, errors }`.
- **`useHistory`** returns `{ seasons?, errors?, error? }`.
- **`formatScore(s: string | null | undefined): string`**: null or empty gives `—`; otherwise it trims and replaces each `-` between digits with `–`. For example, `"4-1"` gives `"4–1"`, `"4–1"` stays `"4–1"`, and `"12 - 3"` gives `"12–3"`.

- [ ] **Step 1: Write the failing tests.**
  - **Storage:** S9 is valid, S10 is `{`, and S11 fails the schema (`season: "x"`). The result has only S9 in `seasons`, and `errors` lists 10 (`bad JSON`) and 11.
  - **Handler:** the response is 200 with `errors`. Update the existing `sum()` fixtures so they pass the schema.
  - **`format.test.ts`:** the four cases above.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.** Update the callers of `useHistory` (grep for them) to the new shape.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `fix: history endpoint skips invalid summaries; formatScore`.

---

### Task 6: History tab parsers

**Files:** create `web/importers/sheets/history.ts` and `web/importers/sheets/history.test.ts`.

**Produces** (pure; the rows are `string[][]` from `readTabs`):

```ts
export interface ChampRow { season: number; champion: string; runnerUp: string | null; score: string | null; finalsMvp: string | null }
export interface AwardsRow { season: number; west: string | null; east: string | null; awards: Partial<Record<'MVP'|'ROTY'|'PPK'|'LP'|'MC'|'DPOY'|'MIP', NameTeam>>;
  asgWinner: string | null; asgLoser: string | null; asgMvp: NameTeam | null; ysgWinner: string | null; ysgMvp: NameTeam | null; fivePoint: NameTeam | null; dunk: NameTeam | null }
export interface NameTeam { name: string; team: string | null }
export interface AllFbaSeason { season: number; slots: string[]; team1: (NameTeam | null)[]; team2: (NameTeam | null)[] }
export interface StandingRow { group: 'E' | 'W'; rank: number; name: string; w: number; l: number }
export interface BioRow { name: string; born: string; entries: string[] }
export function decodeScore(cell: string): string | null
export function splitNameTeam(cell: string): NameTeam | null
export function parseChampionships(rows: string[][]): ChampRow[]
export function parseAwards(rows: string[][]): AwardsRow[]
export function parseAllFba(rows: string[][]): AllFbaSeason[]
export function parsePastStandings(rows: string[][]): StandingRow[]
export function parseBios(rows: string[][]): BioRow[]
```

**Rules:**
- **Empty cells:** `''` and `'X'` (after trimming) mean null. The season cell is `S<n>`; for a row like `S55(1)`, take the leading number.
- **`decodeScore`:**
  - `^\d{4}-(\d{2})-(\d{2})$`, which is what `cellText` gives for a date, becomes `${+mm}–${+dd}`.
  - A whole number of 20000 or more is an Excel serial: `new Date(Date.UTC(1899, 11, 30) + n * 864e5)` gives the UTC month and day, so `43862` becomes `"2–1"` and `45384` becomes `"4–2"`.
  - Any other text goes through `formatScore`.
- **`splitNameTeam`:** split at the last `-`. The right part is the team when it matches `^[A-Z][A-Za-z0-9]{0,4}$` or `^D2\(.+\)$`; otherwise there's no team. So `Paulo Pierre-Kent-CGG` gives `{ name: 'Paulo Pierre-Kent', team: 'CGG' }`, and `Mikey Brewer-FP` gives `FP`.
- **`parseAwards`:** columns are found by the header text in row 0 (`WC Champion`, `EC Champion`, `MVP`, `ROTY`, `PPK Award`, `LP Award`, `MC Award`, `DPOY`, `MIP`, `ASG Winner`, `ASG Losing Captain`, `ASG MVP`, `YSG`, `YSG MVP`, `5pt Contest`, `Dunk Contest`). A missing header throws `Awards tab: no "<header>" column`.
- **`parseChampionships`:** columns A, C, D, F and G (0-based 0, 2, 3, 5 and 6). Skip the header row.
- **`parseAllFba`:**
  - A row with column A = `S<n>` starts a season.
  - The rows after it, where column A is empty and column B is a slot label, add `slots[]`, `team1` (column C) and `team2` (column D).
- **`parsePastStandings`** (one tab):
  - A data row has a number in column B.
  - East is B–E: rank, name, W, L. West is G–J.
  - Numbers can be `"62.0"`, so use `Math.round(Number(x))`.
- **`parseBios`:** column A is the name (skip rows without one), column B is `born`, and columns C onward are the non-empty trimmed `entries`.

- [ ] **Step 1: Write the failing tests** with fixture rows copied from the real tabs. Print them with `node .superpowers/sdd/history/dump.cjs .superpowers/sdd/history/main 9 1 1 60` and so on, and keep each fixture to 1–3 rows.
  - `decodeScore`: `2026-04-01` gives `4–1`; `43862` gives `2–1`; `1-0` gives `1–0`; `X` gives null.
  - `splitNameTeam`: the two cases above, plus `Team Julien Shannon` (no hyphen) gives `{ name: 'Team Julien Shannon', team: null }`.
  - `parseAwards` on the real header plus the S1 and S78 rows (`awards.MVP` for S78 is `{ name: 'Reagan Butler', team: 'HON' }`, `ysgWinner` is `Team Akeem Naylor`); a missing header throws.
  - `parseAllFba` for S58 (OUT/MID/M2/IN) and S68 (G/F/C/ANY/ANY).
  - `parsePastStandings` on S78 rows 2–4 (Carolina Knights 62-24 E rank 1; Honolulu Rays 66-20 W rank 1).
  - `parseBios` on rows 700 and 1330.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: history tab parsers`.

---

### Task 7: History import assembly and `--history`

**Files:** create `web/importers/history.ts` and `web/importers/history.test.ts`; modify `web/importers/run.ts`.

**Interfaces:**
- **Consumes:** Task 6 parsers; `PastBracket` and `SummaryFile` (Task 1); `Report` (`importers/report.ts`); `fbaBrackets.json` shape `{ season: number; rounds: number; series: PastSeries[] }[]`.
- **Produces:**

```ts
export interface HistoryInput {
  players: PlayersFile; teams: Team[] /* current fba + fbad2 */; existing: Map<number, SummaryFile> /* S<=78 files on disk */;
  champs: ChampRow[]; awards: AwardsRow[]; allFba: AllFbaSeason[]; standings: Map<number, StandingRow[]>; bios: BioRow[];
  brackets: { season: number; rounds: number; series: PastSeries[] }[];
}
export function buildHistory(input: HistoryInput, report: Report): { players: PlayersFile; bios: PlayerBiosFile; summaries: SummaryFile[] }
export const normName: (s: string) => string   // trim, ’→', NFD minus \p{M}, lowercase
```

**Rules:**
- **Players (H2, H3):**
  - Index `players.json` by `normName`.
  - For each bio: 0 matches means add `{ id: pNNNNN from nextId, name, birthSeason }`, where `birthSeason` comes from `parsePlayersTab([[name, born]])[0].born`, and bump `nextId`. 1 match links it. 2 or more is `report.warn('names', 'Ambiguous: <name>')` and no bio.
  - Bios are sorted by `playerId`.
  - `resolve(name)` returns the one match in the updated index, or null after `report.warn('names', 'Unmatched: <name> (S<n> <field>)')` or the ambiguous warning. A null result skips the line or leaves the field null.
- **Seasons 1–78:** start from `existing.get(n)` or `{ league: 'fba', season: n, locked: true, host: null, champions: [] }`. Seasons of 79 or more are never produced.
- **Owned fields:**
  - A season with no Championships row gets no FBA Champion entry, and an existing one is kept as it is. A season with no Awards row gets `awards: []`, `confChampions: null` and `allStar: null`.
  - The FBA Champion entry: `{ title: 'FBA Champion', champion, runnerUp, score: decodeScore → en dash, finalsMvp }`, plus `teamId` and `runnerUpId` when the name exactly matches a current team name. Any other `champions` entries are kept.
  - `confChampions: { E: east, W: west }`.
  - `awards`: `[{ award, playerId, teamId: team ?? '?' }]`, in the fixed order MVP, ROTY, PPK, LP, MC, DPOY, MIP.
  - `allFba`: `{ team1: slots.map((slot, i) => ({ slot, playerId, teamId })), … }`.
  - `allStar`: `{ allStars: [], youngStars: [], asgMvp, fivePoint, dunk, asgWinner, asgLoser, ysgWinner, ysgMvp }`, or null when every value is null.
  - `standings` (S71–S78):
    - `teamId` is the current team whose name matches exactly, otherwise the name.
    - `confW`, `confL` and `diff` are null; `marker` and `seed` are null.
    - `playoff` comes from the bracket (the highest round the name appears in; `champion` is true for the final's winner), or null.
  - `pastBracket` is `{ rounds, series }`.
  - `locked` is true.
- **Check each final (H7):** the final's winner and loser names must equal the champion and runner-up (compared with `normName`), and the wins must equal the decoded score. A mismatch is `report.warn('brackets', 'S<n>: final <a> <x>–<y> <b> vs sheet <c> <score> <d>')`. Seasons without a bracket get `report.info('brackets', 'No bracket: S<n>')`.
- **Each summary** must pass `SummaryFile`, and `bios` must pass `PlayerBiosFile`. A failure is `report.error`.
- **`run.ts`:** `--history --data <dir>`. `--data` is required for this flag, and the importer exits with a message without it.
  - It downloads the main sheet and `pastStandings: '1FuPd67Vj8L4Zy4J53Z2jZzw_oqEa-1S5Lzztwq-NDpI'`, reading tabs `Championships`, `Awards, Conference Titles, & AS`, `All-FBA Teams`, `Players` and `S71`–`S78`.
  - It reads the players, teams and summaries from `<dir>`, and `fbaBrackets.json` from `importers/history/`.
  - The report also gets `report.info('players', 'Added <n> players')`.
  - It writes `importers/history-report.md`.
  - On errors it writes nothing and exits 1. Otherwise it writes `players.json`, `leagues/fba/playerBios.json` and each `leagues/fba/S<n>/summary.json`, then logs the counts.

- [ ] **Step 1: Write the failing tests** (`history.test.ts`, small hand-built inputs):
  - **Players:** an existing player links; a new name is added with the next id and its birth season; `Born-FFL S1(-53)` gives `birthSeason: null`; an ambiguous name is reported.
  - **S78 merge:** an existing S78 with `score: '4-1'` and an extra D2-style champion entry keeps the extra entry and gets `score: '4–1'` and `finalsMvp`.
  - **Coverage:** no summary for 79 is produced even when S79 is in `existing`.
  - **Awards and All-FBA:** award and All-FBA lines resolve to ids; an unknown name is reported and skipped.
  - **Standings:** `playoff` is derived from a 2-round bracket; a champion match sets `teamId`.
  - **Final check:** a mismatch is reported and the bracket is still written.
  - **Idempotent:** running `buildHistory` twice (the second run with the first's output as `existing`) gives deep-equal output.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.** Use a temporary empty `importers/history/fbaBrackets.json` (`[]`) if Task 8 hasn't landed yet; Task 8 fills it.
- [ ] **Step 4: Run the tests, tsc and the full suite.** Don't run the CLI.
- [ ] **Step 5: Commit** `feat: history import (--history --data <dir>)`.

---

### Task 8: Transcribe brackets, part 1

**Files:** create or modify `web/importers/history/fbaBrackets.json`; create `web/importers/history/championships.fixture.json` and `web/importers/history/fbaBrackets.test.ts`.

**Pages** (`.superpowers/sdd/history/fba-pages/`): `img019 img044 img054 img055 img071 img080 img088 img106 img114 img123 img132 img002 img008 img020 img027 img028 img036 img037 img053 img062 img063 img081 img097` (`.jpg`).

**How to read a page** (open each with the Read tool):
- **Title:** it must say `FBA Elite Tournament`, and the season is the `S<n>` under it. Any other title: skip the page and list it in the report.
- **First-round slots:** read the far-left column top to bottom, pairing slots 1–2, 3–4 and so on. Series `R1-k` has the upper slot as `home` and the lower as `away`.
  - `name` is the text before `(`, as printed. `record` is the `W-L` (or `W-L-T`) in the brackets, or null.
  - `seed` is the grey number at the far left of the slot line, or null when none is printed. The grey `(n)` next to a join is a game number; ignore it.
  - A `BYE` slot is null.
- **Later rounds:** the name on the next column's line is the winner, and the number below it is `winnerWins - loserWins`.
  - A later-round side carries its team's first-round `seed` and `record`.
  - `rounds = log2(first-round slots)`: 16 slots is 4 and 8 is 3.
  - A BYE series has 0–0 wins and the present team as its winner.
- **Output entry:** `{ season, rounds, series }`, with `series` ordered R1-1…, R2-1…, and so on. The file is one array sorted by season.

**Fixture:** build `championships.fixture.json` as `[{ season, champion, runnerUp, score }]` for S1–S78 from `node .superpowers/sdd/history/dump.cjs .superpowers/sdd/history/main 8 2 80 7`. Decode the scores with `decodeScore` (Task 6); a cell like `43862.0` is a serial.

**Test (`fbaBrackets.test.ts`):**
- Each entry passes `PastBracket`.
- Seasons are unique and ascending.
- Each final matches the fixture row: the winner is the champion, the loser the runner-up, and `${winnerWins}–${loserWins}` equals the score, compared with `normName`.

- [ ] **Step 1:** Write the test and the fixture. Running against `[]` passes trivially; add a `expect(data.length).toBeGreaterThanOrEqual(23)` guard that fails until the pages are in.
- [ ] **Step 2:** Transcribe the 23 pages.
- [ ] **Step 3:** Run the test. Fix every mismatch by re-reading the page. When the page itself disagrees with the sheet, keep the page and add the season to an `ALLOWED_MISMATCH` list in the test, with a comment quoting both.
- [ ] **Step 4: Run tsc and the full suite.** In the report, list which pages mapped to which seasons, and any skipped pages.
- [ ] **Step 5: Commit** `data: transcribe FBA brackets (part 1)`.

---

### Task 9: Transcribe brackets, part 2

**Files:** modify `web/importers/history/fbaBrackets.json` and `web/importers/history/fbaBrackets.test.ts`.

**Pages:** `img098 img115 img124 img133 img140 img014 img021 img030 img038 img039 img043 img047 img048 img056 img068 img073 img084 img090 img095 img111 img116 img125 img138`.

Follow the same reading rules as Task 8; they are copied here so this task stands alone:
- **Title:** it must say `FBA Elite Tournament`, and the season is the `S<n>` under it. Any other title: skip the page and report it.
- **First-round slots:** read the far-left column top to bottom, pairing 1–2, 3–4 and so on. `R1-k` has the upper slot as `home` and the lower as `away`.
  - `name` is the text before `(`. `record` is the `W-L` (or `W-L-T`) in the brackets, or null.
  - `seed` is the grey far-left number, or null. The grey `(n)` next to a join is a game number; ignore it.
  - A `BYE` slot is null.
- **Later rounds:** the next column's line shows the winner, with `winnerWins - loserWins` below it. A later-round side carries its first-round `seed` and `record`.
  - `rounds = log2(slots)`.
  - A BYE series has 0–0 wins and the present team as its winner.
- **Output:** insert each entry into the array in season order.

A season that already exists in the file means two pages for the same season: stop and report it.

- [ ] **Step 1:** Raise the guard to `toBeGreaterThanOrEqual(46 - <pages skipped in Task 8 and here>)`.
- [ ] **Step 2:** Transcribe the 23 pages.
- [ ] **Step 3:** Run the test and fix mismatches as in Task 8.
- [ ] **Step 4: Run tsc and the full suite.** Report the pages and seasons, the seasons from S1–S78 that have no bracket, and the allowed mismatches.
- [ ] **Step 5: Commit** `data: transcribe FBA brackets (part 2)`.

---

### Task 10: Bracket rendering for history (H8)

**Files:** modify `web/app/playoffs/Bracket.tsx` and its callers (`PlayoffsPage.tsx`); create `web/app/history/PastBracket.tsx` and `web/app/history/PastBracket.test.tsx`.

**Produces:**
- **`Bracket` props:** `playoffs` becomes `series: PlayoffSeries[]`, and `onOpen` becomes optional. When `onOpen` is undefined, the series boxes render as `<div className="series-box">`, not as buttons. `PlayoffsPage` passes `pf.series`.
- **`PastBracket({ bracket, teams, season }: { bracket: PastBracket; teams: Team[]; season: number })`:**
  - It renders the same `bracket`, `bracket-col`, `series-box` and `series-side` markup (with `seed`, `logo`, `name`, `wins`, and `won` on the winner) as `Bracket`'s `Side`.
  - **Columns:** for `rounds = R`, the left half is R1…R(R−1), keeping the series with `k ≤ n/2` in each; then the centre column `R<R>-1`; then the right half mirrored, R(R−1)…R1 with `k > n/2`. For `R = 1`, only the centre.
  - A null side shows `BYE`, with no wins.
  - A side whose `name` equals a current team's `name` shows `<TeamMark team season size={18} />`, and its text is `abbr name`. Otherwise it shows `<span className="logo" aria-hidden="true" />` and the name as printed.

- [ ] **Step 1: Write the failing tests.**
  - **An 8-team tree:** 3 R1 columns on the left and right, with 2 R1 boxes in the first column, and the centre has `R3-1`. The winner side has class `won`, and the wins show.
  - **BYE:** a BYE side renders `BYE`.
  - **Team marks:** a name matching a current team renders an `img`.
  - **`Bracket`:** without `onOpen` it renders no buttons, and `PlayoffsPage.test.tsx` still passes.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: PastBracket in the app bracket style`.

---

### Task 11: History view rows, the player index and honours

**Files:** create `web/engine/history/views.ts`, `web/engine/history/honours.ts` and their tests.

**Produces:**

```ts
export interface ChampionshipRow { season: number; champion: string; runnerUp: string | null; score: string; finalsMvp: string | null /* playerId */; west: string | null; east: string | null }
export function championshipRows(seasons: SummaryFile[]): ChampionshipRow[]   // newest first
export interface AwardRow { season: number; winners: Partial<Record<'MVP'|'ROTY'|'PPK'|'LP'|'MC'|'DPOY'|'MIP', { playerId: string; teamId: string }>> }
export function awardRows(seasons: SummaryFile[]): AwardRow[]                   // newest first
export function playerIndex(seasons: SummaryFile[], bios: PlayerBiosFile | null, players: PlayersFile): { playerId: string; name: string }[]  // sorted by name
export function searchPlayers(index: { playerId: string; name: string }[], q: string): { playerId: string; name: string }[]  // normalised substring; '' returns all
export interface Honour { season: number; text: string }
export function playerHonours(seasons: SummaryFile[], playerId: string): Honour[]  // season ascending
export function playerLines(seasons: SummaryFile[], playerId: string): { season: number; line: SummaryPlayerLine }[]
```

**Rules:**
- **`championshipRows`:**
  - It uses the `champions` entry whose `title === 'FBA Champion'`; a season without one is skipped.
  - `score` is `formatScore`.
  - `west` and `east` come from `confChampions` when set. Otherwise they are the winners of the `W-CF` and `E-CF` series in `bracket`, named through `standings` (by `teamId`), falling back to the id. Without either they are null.
- **`playerIndex`:** the ids from bios, plus every playerId named in:
  - `awards`, `allFba`, the `allStar` fields (`asgMvp`, `fivePoint`, `dunk`, `ysgMvp`, `allStars`, `youngStars`), `champions[].finalsMvp` and `players[]`.
  - The name comes from `players.json`, skipping ids with no name.
- **`playerHonours` texts, in this order within a season:**
  - `Finals MVP`;
  - `<AWARD>` using the award labels already used on `app/awards` (grep for them; for example `MVP`, `Rookie of the Year`);
  - `All-FBA Team <1|2> (<slot>)`;
  - `All-Star` or `Young-Star` (selection);
  - `All-Star Game MVP`, `Young-Star MVP`, `5-point contest winner`, `Dunk contest winner`.

- [ ] **Step 1: Write the failing tests** with three hand-built summaries: an imported S48 with `confChampions` and an OUT/MID/IN/ANY All-FBA; an app-style S79 with a `bracket` (`E-CF` and `W-CF` winners), `standings` and `players`; and one with no FBA Champion entry.
  - The rows are ordered, and the S79 conference champions are derived.
  - `searchPlayers('lucic')` finds `Cameron Lučić`.
  - `playerHonours` lists the texts in order.
  - `playerLines` returns the S79 lines.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: history view rows, player index and honours`.

---

### Task 12: History hub, Championships and Awards pages

**Files:** create `web/app/history/HistoryHome.tsx`, `ChampionshipsPage.tsx`, `AwardsHistoryPage.tsx`, `PlayerLink.tsx` and `HistoryPages.test.tsx` under `web/app/history/`; modify `web/app/shell/Layout.tsx`, replacing the `/history` placeholder route.

**Routes:**
- `/history` shows `<h1>History</h1>` and links: `Championships` (`/history/fba/championships`), `Awards` (`/history/fba/awards`), `Seasons` (`/history/fba/season/<latest season in history>`) and `Players` (`/history/fba/players`).
- `/history/fba/championships` has `<h1>FBA Championships</h1>` and a table with Season, Champion, Runner-up, Score, Finals MVP, West and East.
- `/history/fba/awards` has `<h1>FBA Awards</h1>` and a table with Season, MVP, ROTY, PPK, LP, MC, DPOY and MIP. Each cell is `<PlayerLink> (<teamId>)`, or `—`.
- The Season column links to `/history/fba/season/<n>`.

**Award cells:** an award `teamId` of `?` (no team on the sheet) is shown without the `(…)`.

**Components and states:**
- **`PlayerLink({ id, players })`** is `<Link to={/history/fba/players/${id}}>` with the name, or `—` for null.
- **Errors:** when `errors.length > 0`, each page shows `<p className="warning">Some seasons couldn't be read: S10, S11</p>`.
- **Loading** shows `Loading…`; a fetch error shows it in `.error`.

- [ ] **Step 1: Write the failing tests** (stub `fetch` for `/api/history/fba` and `players.json`):
  - The hub links.
  - Championships: two seasons, newest first, with the en-dash score and a Finals MVP link.
  - Awards: the MVP link and team.
  - The errors warning.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.** Reuse the existing table class used by `StandingsPage`.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: history hub, Championships and Awards pages`.

---

### Task 13: Season page

**Files:** create `web/app/history/SeasonHistoryPage.tsx` and `web/app/history/SeasonHistoryPage.test.tsx`; modify `Layout.tsx` (`/history/fba/season/:season`).

**Page:**
- **Data:** it loads `useHistory('fba')`, `players.json`, and both `leagues/fba/teams.json` and `leagues/fbad2/teams.json`. The teams list for `PastBracket` and `Bracket` is both leagues' teams.
- **Heading and picker:** `<h1>S<n> FBA season</h1>`, a `<select aria-label="Season">` over every season in history (it navigates on change), and tab buttons `Standings | Playoffs | Awards & All-FBA | All-Star` (state, with Standings as the default).
- **Standings:**
  - Two tables, `Eastern Conference` (`group === 'E'`) and `Western Conference`, sorted by `rank`.
  - Columns are Rank, Team, W, L and W% (`(w / (w + l)).toFixed(3)`; `0 games` shows `—`).
  - Conf (`confW-confL`), Diff, marker and Seed columns appear only when some row has them non-null.
  - Without standings: `No standings recorded`.
- **Playoffs:**
  - `bracket` set: render `<Bracket league="fba" series={bracket.series} teams season group={null} open={null} />` with no `onOpen`.
  - Else `pastBracket` set: `<PastBracket …>`.
  - Else, with an FBA Champion entry: `<p>Finals: <champion> def. <runnerUp>, <formatScore(score)></p>`.
  - Else: `No playoffs recorded`.
  - Below any of these: `Finals MVP: <PlayerLink>` when set.
- **Awards & All-FBA:**
  - An award list of `label: <PlayerLink> (team)`.
  - Two All-FBA tables (Team 1 and Team 2), with the slot label and the player in each row.
  - `No awards recorded` when both are empty.
- **All-Star:** each row is shown only when set: `All-Star Game: <asgWinner> def. <asgLoser>`, `All-Star Game MVP`, `Young-Star champions: <ysgWinner>`, `Young-Star MVP`, `5-point contest`, `Dunk contest`, then the All-Star and Young-Star lists. With nothing set: `No All-Star results recorded`.
- **Unknown season:** `Not found`.

- [ ] **Step 1: Write the failing tests.**
  - **Imported S72:** Standings are null (`No standings recorded`); Playoffs shows `PastBracket` with a `won` box for the final; the All-FBA table shows the `OUT` label.
  - **App S79:** Standings show the Conf column, and Playoffs renders `Bracket` with no buttons.
  - **Picker:** changing the select navigates.
  - **`/history/fba/season/999`** shows `Not found`.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: season history page`.

---

### Task 14: Players list and player page

**Files:** create `web/app/history/PlayersHistoryPage.tsx`, `web/app/history/PlayerHistoryPage.tsx` and `web/app/history/PlayersHistory.test.tsx`; modify `Layout.tsx` (`/history/fba/players` and `/history/fba/players/:playerId`).

**Players list** (`/history/fba/players`):
- `<h1>FBA Players</h1>`, `<input type="search" aria-label="Search players">`, a count `<n> players`, and a list of `PlayerLink`s from `searchPlayers(playerIndex(...), q)`.
- `playerBios.json` returning 404 counts as `null`.

**Player page** (`/history/fba/players/:playerId`):
- `<h1>name</h1>`, `Born: <bio.born>`, and a `<ul>` of `bio.entries`, in bio order and exactly as written.
- `Honours` grouped by season: `S<n>: text, text`.
- `Seasons` table: Season, Team (or `Total`), GP, PTS, PPG; then Playoffs GP, PTS and PPG (`—` when `po` is null).
- An id not in `players.json` shows `Not found`. A player with no bio or honours still shows the name and `No history recorded`.

- [ ] **Step 1: Write the failing tests.**
  - **List:** the list shows the index; typing `lucic` filters it to `Cameron Lučić`; clicking a name goes to the player page.
  - **Player page:** it shows the bio entries, honours in season order and a stat table with a `Total` row. An unknown id shows `Not found`, and a missing bios doc still renders the page.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: FBA players directory and player history page`.

---

## After the tasks (controller)

1. **Final review:** one Opus review of `main..fba-history`.
2. **Browser check:** text only, on scratch data (CLAUDE.md "Browser checks").
   - **Prep:**
     - Run `prep.mjs`.
     - Run `npm run import -- --history --data <scratch data dir>` in the background; the main sheet is about 47 MB and slow to read. Read `importers/history-report.md`, then delete it or restore it with `git checkout`, so the tree stays clean.
   - **Walk-through:**
     1. `/history`: the hub links work.
     2. Championships: S1 (`1–0`), S55 (a decoded date score) and S78 (`4–1`, Finals MVP linked).
     3. Awards: the S78 MVP is Reagan Butler.
     4. Season S72: its PastBracket matches the page image; S78 standings show 15 teams per conference; S48 All-FBA shows OUT/MID/IN/ANY.
     5. Players: search `lucic`, open the player, and check the bio entries and honours.
     6. On the scratch server only, at a finished S79 FBA playoffs if the scratch data allows (otherwise skip it and say so), pick a Finals MVP and see that Finish no longer refuses.
   - **Also check:** 375px width and the console.
3. **Wrap-up:** update `progress.md`, the §10 roadmap row for 3a, and the roadmap memory. Stop for the user before merging.
