# Part 2a Phase 2: The D2 Cycle — Design

**Date:** 2026-09-27
**Status:** Approved in brainstorming; awaiting spec review
**Parent specs:**
- `docs/superpowers/specs/2026-09-25-fba-web-design.md` (program)
- `docs/superpowers/specs/2026-09-26-roster-moves-free-agency-design.md` (part 2a). This document replaces §5 of that spec and fills in the D2 parts of its §2, §6, and §8.

**Where it fits:** Phase 1 (roster moves and free agency) is merged. After **Close free agency**, the S79 calendar runs *FBAD2 Ratings(reset)* and then *FBAD2 Draft*. Phase 2 builds both steps in the app, plus the save-safety work that the Phase 1 final review deferred (I3).

## 1. Goal

- **Safe saving.** A stale tab or a double-click can't overwrite newer data.
- **D2 ratings reset.** The app suggests a new D2 rating for every D2 player, and the user approves or edits each one.
- **Build the pool.** Rank each position, let the user drag to override the order, then lock the top 64. Everyone else goes to Reserves.
- **D2 draft.** The open slots are shuffled into a pick order, and the user makes every pick.

## 2. Save safety (prerequisite, built first)

### 2.1 Versions
- Every document has a **version**: the first 16 hex characters of the SHA-256 of its file bytes. A document that doesn't exist has version `null`.
- `GET /api/state/<path>` returns the doc unchanged, and adds an `ETag: "<version>"` header.
- `PUT /api/state/<path>` requires an `If-Match: "<version>"` header.
  - To create a new file, send `If-Match: "null"`.
  - A missing header is refused with **428**.
  - A mismatch is refused with **409** `{ error, conflicts: [path] }`.
  - On success, the response is `{ ok: true, version }`.
- `POST /api/batch` writes are `{ path, doc, baseVersion: string | null }`, and every write needs `baseVersion`.
  - The server checks all versions **inside the write queue** before it writes anything.
  - Any mismatch refuses the whole batch with **409** and lists the stale paths.
  - On success, the response adds `versions: { [path]: version }`.
- Undo is unchanged. It already refuses to restore a file that changed since the batch.

### 2.2 Client
- `useDoc` returns `{ data, version, error, reload }`.
  - `putDoc(rel, doc, baseVersion)` and `postBatch(label, writes)` take versions.
  - `useRosterState` keeps the version of every document it loaded, and `commitMove` sends them.
- **Cross-tab sync.** After any successful save or undo, the app posts the saved paths on `BroadcastChannel('fba-docs')`. Other tabs reload those docs through the same `doc-saved` path they already use.
- **In-flight guard.** A module-level `saving` counter is exposed through `useSaving()`. Every button that saves (sign, release, trade, edit, close FA, finish ratings, lock pool, re-roll, pick, undo) is disabled while a save is in flight.
- **On 409,** the toast says: "This data changed in another tab or window. It has been reloaded; check it and try again." The affected docs are reloaded.

## 3. D2 ratings reset (calendar step `fbad2-ratings-reset`)

### 3.1 Who is rated
The step is available once FBA free agency is closed (`freeAgents.locked`). At that point, unsigned free agents are already in D2 Reserves. The rated list is every player on an S79 D2 roster plus every player in S79 D2 Reserves, roughly 530 players.

### 3.2 Suggested rating (`web/engine/d2/ratings.ts`, pure, RNG injected)
Players with a current D2 rating (the roster entry's `rating`) are the only ones who get a suggestion:

`suggested = clamp(old + age + perf + luck, 40, 99)`

- **age:** uses the S79 age, which is already advanced this offseason.

  | Age | Adjustment |
  |---|---|
  | ≤22 | +3 |
  | 23–25 | +2 |
  | 26–29 | 0 |
  | 30–31 | −2 |
  | 32 | −3 |

  Players retire after their age-32 season, so nobody in the pool is older than 32.
- **perf:** from the S78 D2 rosters (`points`, season totals).
  1. Fit a least-squares line `points ≈ a + b·rating` over every S78 D2 roster player with points > 0.
  2. Each player's residual is divided by the residuals' standard deviation to give z.
  3. z ≥ 1.5 → +2; z ≥ 0.5 → +1; z ≤ −1.5 → −2; z ≤ −0.5 → −1; otherwise 0.
  4. A player with no S78 D2 row, or with 0 points, gets 0.
- **luck:** an integer from −2 to +2, drawn once from the injected RNG.

Players with no D2 rating (all Reserves, including the former FBA free agents) get `suggested = null` and start blank.

The breakdown `{ age, perf, luck }` is stored with each suggestion and shown only as a tooltip on the suggested value. Nothing is recomputed on reload.

### 3.3 Document: `leagues/fbad2/S<n>/ratings.json`
```
{ league: 'fbad2', season, locked: boolean,
  players: [{ playerId, position, age, team: string | null,  // D2 team id, or null for Reserves
              oldRating: number | null, suggested: number | null,
              breakdown: { age, perf, luck } | null,
              rating: number | null }] }                     // the new rating; starts equal to suggested
```
- **Start ratings reset** is a button, not an automatic action. It creates the doc in one batch, so the luck roll happens exactly once.
- Edits save as the user leaves a box, through `PUT` with `If-Match`. They are not journaled, so they don't fill the Undo history, which keeps only the last 50 entries.
- Ratings must be whole numbers from 1 to 99. A blank is allowed until Finish.

### 3.4 Screen: `/league/fbad2/ratings`
- **Tabs:** All · PG · SG · SF · PF · C, with counts.
- **Needs a rating:** blank players are grouped at the top of each tab. Under them, rated players are sorted by the new rating (descending), with ties broken by younger age and then name. The list re-sorts when a box loses focus.
- **Columns:** Player · Age · From (team abbr / Reserves / "FBA FA" tag for players who came from free agency this season) · Old · Suggested (with a +/− delta) · New (editable). Edited rows (new ≠ suggested) are highlighted.
- **Filter chips:** All · Needs rating · Edited · D2 roster · Reserves · FBA FA.
- A header count says how many players still need a rating.
- **Finish ratings** is disabled until nobody is blank. As one batch, it:
  - writes the new ratings onto the D2 roster entries and Reserves entries;
  - locks `ratings.json`;
  - adds a `d2-ratings` transaction (`D2 ratings reset: N players, M edited`);
  - marks the calendar step done.

  Undo reverses it.

## 4. Build the pool (first half of calendar step `fbad2-draft`)

### 4.1 Document: `leagues/fbad2/S<n>/pool.json`
```
{ league: 'fbad2', season, locked: boolean,
  order: { PG: [playerId…], SG: […], SF: […], PF: […], C: […] } }   // every rated player, best first
```
- Created by **Start pool** (a batch) once ratings are finished. It ranks each position by rating (descending), then younger age, then name.
- Drags save through `PUT` with `If-Match`.
- **Reset to ratings order** re-ranks the list.

### 4.2 Screen: `/league/fbad2/draft` (before the pool is locked)
- One tab per position, listing every pool player in order with rank, name, age, rating, and where they are now (team / Reserves).
- A **cutoff line** sits after rank 64.
- **Ties at the cutoff:** players whose rating equals the 64th player's rating, on either side of the line, are highlighted.
- **Moving players:** drag rows up or down with the mouse. There are also ↑/↓ buttons on each row, and keyboard focus plus Alt+↑/↓, for precise moves.
- **Summary strip, per position:** pool size, roster players kept, bumped roster players, draft-pool size, open slots.
- **Lock pool** is one batch:
  - Every roster player ranked below 64 is **bumped**: removed from their team (the slot becomes vacant) and added to Reserves with their new rating.
  - Reserves players ranked in the top 64 stay in Reserves, and they make up the **draft pool**.
  - The pool is locked.
  - `draft.json` is created with a shuffled ticket list.
  - A `d2-pool` transaction lists every bumped player (`Bumped to Reserves: PG-Ben Montgomery (AMS)`).

  The draft pool is derived, not stored separately: top 64 of `pool.order` ∩ Reserves.
- If a position has fewer than 64 players, the cutoff is the list length, and a warning says that some slots at that position can't be filled.

## 5. The draft (second half of `fbad2-draft`)

### 5.1 Document: `leagues/fbad2/S<n>/draft.json`
```
{ league: 'fbad2', season, locked: boolean,
  tickets: [teamId…],                       // one per open slot at lock time, fully shuffled together
  picks: [{ teamId, playerId: string | null, position: Position | null }] }   // null = skipped
```
- **Tickets** are built from each team's vacancies when the pool locks, then shuffled with a Fisher–Yates shuffle and the injected RNG. A team with two openings gets two tickets anywhere in the order, and they can be back to back.
- **Re-roll order** is a batch, and it's only allowed while `picks` is empty.

### 5.2 Screen: `/league/fbad2/draft` (after the pool is locked)
- **Left column:** the pick order. Made picks are greyed out with the player, the ticket on the clock is highlighted, and the rest are listed after it.
- **Right column:** the team on the clock (logo, current roster, open positions), then the **available** players at *every* position that team still needs, sorted by rating.
- Clicking a player shows **Draft <name> → <team>** to confirm. The pick is one batch:
  - the player goes into the vacant slot with their D2 rating and age, and `points: 0`;
  - they are removed from Reserves;
  - the pick is appended;
  - a `drafted` transaction is logged (`D2 Draft #7: LIS selects SF-Akeel Moody`).
- **Undo last pick** calls the global undo, and it's enabled when the newest journal entry is a draft pick. Undoing the lock (when no picks exist) is the same global Undo, which unlocks the pool.
- **Skip pick:** if no available player matches any position the team needs, the only action offered is **Skip pick**, which records `playerId: null`. The team keeps its vacancy. This only happens when a position had fewer than 64 players.
- **Completion:** after the last ticket, the pick batch also:
  - sets `draft.locked`;
  - marks the calendar step `fbad2-draft` done.

  The page then shows a summary of all picks. Because the draft pool matches the open slots exactly, nobody is left over.

## 6. Engine and data changes

**New modules in `web/engine/d2/`** (pure, tested; each move function returns the Phase 1 `MoveResult` shape):
- `ratings.ts`: `ageAdjustment`, `performanceScores`, `buildRatings`, `ratingsBlockers`, `finishRatings`.
- `pool.ts`: `rankPosition`, `buildPool`, `cutoffTies`, `lockPool`.
- `draft.ts`: `shuffleTickets`, `onTheClock`, `availableFor`, `makePick`, `skipPick`, `rerollOrder`.

**`D2State`** extends the loaded state with `ratings`, `pool`, `draft`, the S78 D2 rosters (read-only), and the calendar.

**Schemas** (strict zod, registered in `schemaRegistry`, with body/path agreement checked):
- `D2RatingsFile`, `D2PoolFile`, `D2DraftFile` at `leagues/fbad2/S<n>/{ratings,pool,draft}.json`.
- `TransactionType` gains `drafted`, `d2-pool`, and `d2-ratings`.
- `ReservePlayer` gains an optional `fromFba?: true`. `closeFreeAgency` sets it on the players it moves, and the ratings screen uses it for the "FBA FA" tag. S79 free agency isn't closed yet, so no data migration is needed.
- The storage lock message becomes generic: "`<path>` is locked (finished) and can't be changed". A locked stage document is now a normal case, not only a finished season.

**Calendar:** `TOOL_STEPS` gains `fbad2-ratings-reset → /league/fbad2/ratings` and `fbad2-draft → /league/fbad2/draft`.

**Invariant test** (`web/data.test.ts`): no player appears in more than one of the FBA rosters, D2 rosters, free agents, and Reserves. This stays true through the draft, because draft-pool players remain in Reserves until they are picked.

## 7. Error handling

- A rule problem, such as a blank rating at Finish, a pick at a position the team doesn't need, re-rolling after a pick, or locking with ratings unfinished, disables the button and shows the reason next to it.
- A 409 from a version conflict shows the conflict toast from §2.2 and reloads the docs.
- If `ratings.json` or `pool.json` is missing, the page shows its **Start** button. A page opened too early explains which step comes first ("Close free agency first", "Finish D2 ratings first").

## 8. Testing

- **Save safety:**
  - storage and handler: version computation, `ETag` on GET, 428 when `If-Match` is missing, 409 on a stale PUT, 409 on a stale batch path with nothing written, and `null` meaning "must not exist";
  - client: `useDoc` exposes `version`, a BroadcastChannel message triggers a reload, and buttons are disabled during a save.
- **Ratings:**
  - the age table at every boundary (22/23, 25/26, 29/30, 31/32);
  - performance buckets on a small fixture with a known regression;
  - luck is deterministic with a seeded RNG;
  - clamping at 40 and 99;
  - blanks for players with no rating;
  - Finish is blocked while any rating is blank;
  - Finish writes the ratings onto the rosters and Reserves.
- **Pool:**
  - the ranking tie-breaks;
  - the cutoff at 64 and when a position has fewer players;
  - ties at the cutoff are highlighted;
  - a drag override survives a save and reload;
  - lock bumps below-cutoff roster players into Reserves and vacates their slots;
  - the ticket count equals the vacancies.
- **Draft:**
  - the shuffle is deterministic with a seeded RNG;
  - re-roll is refused after a pick;
  - a pick must be at a position the team needs and must be in the draft pool;
  - Skip is only allowed when nothing matches;
  - completion locks the draft and marks the calendar step;
  - undo restores the last pick.
- **UI:**
  - the ratings tabs, sort order and blank group;
  - drag and the ↑/↓ keyboard reorder;
  - the draft click-to-pick flow, with a stubbed API;
  - a browser check on real S79 data after Close free agency, done in a scratch copy of the data dir so the real save isn't touched.

## 9. Out of scope

These are left for later parts:
- D2 season play and schedules (2b / part 4).
- D2 trades, and D2 slot blocking after the draft.
- The FBA draft and lottery.
- Retirement.
- Season rollover (creating the S80 docs).
- Tuning the formula numbers through a settings screen. For now they are constants in `ratings.ts`.
