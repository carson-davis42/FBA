# Part 2a: Roster Moves & Free Agency — Design

**Date:** 2026-09-26
**Status:** Approved in brainstorming; awaiting spec review
**Parent spec:** `docs/superpowers/specs/2026-09-25-fba-web-design.md`. The original "part 2" is split into **2a (this document)** and **2b (FBA season play)**.
**Why now:** the season calendar sits at *S79 · Free Agency/Offseason*. The user chose to do free agency in the app (option B) rather than finishing it in the sheets.

## 1. Goal

Run the S79 offseason in the app, from free agency through the D2 draft, for **FBA and FBAD2**:

- Sign free agents, including picking the team and the contract.
- Release or cut players.
- Make trades involving players and conditional draft picks.
- Edit ratings, ages, and contracts.
- Close free agency, which sends leftover free agents to the D2 pool.
- Reset D2 ratings.
- Build the D2 pool (top 64 per position, adjustable by drag).
- Run the D2 draft, with the user making every pick.

JC recruiting, the FBA draft, schedules, and season play are out of scope. See §11.

## 2. Calendar integration

The calendar steps (from the S79 block of the calendar sheet) map to screens as follows:

| Step | What Continue ▸ opens | How the step completes |
|---|---|---|
| Free Agency/Offseason | FA market | **Close free agency** button. It only succeeds when every FBA team has exactly one player at each of PG/SG/SF/PF/C, payroll ≤ $25, and no expired contracts left on the roster. On success, every unsigned FBA free agent moves to the D2 pool and the step is marked done. |
| FBAD2 Ratings(reset) | D2 rating editor | **Finish ratings** button. It succeeds when every player in the D2 pool has a D2 rating. |
| FBAD2 Draft | D2 draft board | It succeeds when every D2 team has exactly one player per position. |

Trades, Release/Cut, and Edit are available at any time from the market, team pages, and player rows. Slot rules are only enforced at the checkpoints above.

## 3. Rules (pure functions in `web/engine/roster/`)

### 3.1 FBA contracts
- **Team payroll cap is $25.** Payroll counts only active contracts (`contractEnd ≥ current season`); expired contracts are off the books.
- **Per-player amount:** a whole number of dollars from $1 to $8.
- **Length** is the number of seasons, starting with the current one, so `contractEnd = season + years − 1`. The limits:
  - At most **4 years** for a new signing.
  - At most **5 years** when a team re-signs its own player. "Own player" means he is on that team's roster with an expired contract.
- **Years ≤ dollars.** For example, 2 years at $1 is invalid.
- **Rookie scale** (every rookie contract is **restricted**):
  - A drafted rookie gets 2/$2.
  - An undrafted rookie signed later gets 1/$1, or 2/$2 if the team has the cap room.
- **Restricted** is a flag on the contract. When a restricted contract expires, only the player's current team may act: it re-signs him under the re-sign rules, or releases him, which makes him an unrestricted free agent. Other teams can't sign him while he's restricted.
- **Unrestricted expired contracts:** the player stays listed on his team (tagged *Expired*) and also appears in the market. His team can re-sign him (5-year max). Any other team can sign him under the new-signing rules, which removes him from his old team.

### 3.2 Signing
- The sign panel picks the player, the team, the years, and the amount, and shows every rule check live.
- If the team already has a player at that position, the panel offers "and release / cut [current player]" in the same move. The user may also go over temporarily and fix it later with a release, cut, or trade.
- **Signing a D2 player to an FBA team:** the panel asks for his new **FBA rating** (D2 and FBA ratings are on different scales). The move removes him from his D2 roster, which opens that D2 slot.
- **Signing a player with no rating** (an unrated rookie): the panel requires a rating.

### 3.3 Release / Cut
- The player is removed from his team and added to the league's free-agent pool (FBA) or to Reserves (D2).
- The two only differ in the transaction label: **Released** is the player's decision or the contract ending; **Cut** is the team's decision.
- There is no cap penalty.

### 3.4 Edit (commissioner)
- Directly set rating, age, contract end, amount, and the restricted flag.
- Rule violations show as warnings but are allowed.
- Every edit is logged.

### 3.5 Trades
- Two or more teams. Assets are players and pick obligations (§4). With three or more teams, each asset gets a destination team.
- A trade is **blocked** if any team would be over $25 after it.
- Slot problems (a missing or doubled position) **warn** while free agency is open, and **block** outside free agency.
- It is logged in the sheet's format: a header `CGG/MON`, then lines like `->MON SG-Justin Green` and `->CGG S81 Draft Pick(via MON)(4P)`.
- **D2 trades** follow the same flow without contracts or the cap.

## 4. Draft pick obligations

### 4.1 Model (`leagues/fba/picks.json`)
Each obligation holds:
- `id` and `season` (the draft it conveys in)
- `originalTeam` (whose pick it is) and `owner`
- `condition`, one of:
  - `{ kind: 'none' }` (unprotected)
  - `{ kind: 'top', n }` (top-N protected)
  - `{ kind: 'lottery' }` (protected for as many spots as there are non-playoff teams: FBA teams minus 16 playoff spots, currently 14)
  - `{ kind: 'swap', otherTeam, betterTo }`
  - `{ kind: 'custom', text }`
- `originalCondition`
- `originSeason` (the season the obligation was first owed for: the "(S75)" in the sheet; rolls since then are season − originSeason)
- `priority` (the order among obligations owed from the same original team's pick)
- `rolls[]`: history entries `{ fromSeason, reason: 'protected' | 'already-owed' }`
- `note`

Every team also owns its own pick for each season from current + 1 through current + 4 (S80–S83 now). "Own" picks are implicit: a pick with no obligation stays with its original team.

### 4.2 Resolution (`resolvePicks`)
A pure function, tested now and used by the FBA draft in a later part. It runs once a season's draft order is fixed. For each original team's pick that season, it takes the obligations owed from it in `priority` order:

1. **Swap:** give the better (earlier) of the two teams' picks to `betterTo`; the other team gets the other pick.
2. **Custom:** do not auto-resolve. Return the pick flagged for a manual decision.
3. **Conveying:** the first obligation whose protection isn't triggered conveys the pick to its owner. A pick in slot k is protected under `top n` when k ≤ n, and under `lottery` when k ≤ the lottery size.
4. **Rolling:** any obligation that doesn't convey rolls to the next season, and its protection shrinks by one. This covers obligations that were protected and obligations that couldn't convey because the pick already went to someone else; they roll either way.
   - `lottery` becomes `top (lotterySize − 1)`.
   - `top n` becomes `top n−1`.
   - `top 0` means unprotected.
5. A rolled obligation joins the next season's queue for that team's pick, after any obligations already there (keeping `priority` order), and rolls again if needed.

Test cases come from the real data:
- DCB owes OV (originally LP, S75) and NY (originally 12P, S79).
- The S80 tab shows OV at *Top 9, priority 1* and NY at *Top 11, priority 2*.

### 4.3 Trade UI for picks
When a pick is sent, the builder asks for its condition: Unprotected / Top-N (the user enters N) / Lottery protected / Pick swap (choose the other team and who gets the better pick) / Custom text.

## 5. D2 cycle

### 5.1 Pool
- When FBA free agency closes, the **D2 pool** for S79 = current D2 roster players + D2 Reserves + FBA free agents who went unsigned.
- **FBAD2 Ratings(reset):** a bulk editor listing every pool player by position, where the user sets a D2 rating for each. Unrated players are highlighted, and the step can't finish while any remain.

### 5.2 Draft board, step 1: build the pool
- For each position, the app ranks the pool by D2 rating. The tie-break is younger age, then name.
- The top 64 at each position are D2-caliber, and a cutoff line shows where the 64th spot falls.
- The user can **drag players up or down** to override the order. Ties at the cutoff are highlighted.
- **Lock pool** commits the ranking:
  - Players below the cutoff go to **Reserves**.
  - A player on a D2 roster who ended up below the cutoff is **removed from his team**, which opens a spot.
  - A top-64 player who isn't on a D2 roster enters the **draft pool**.
- Before the first pick is made, the pool can be unlocked with **Undo**.

### 5.3 Draft board, step 2: the draft
- Every D2 team gets one pick per open slot. The **order is randomized**, with **Re-roll** allowed before the first pick.
- The team on the clock is highlighted. The available list is filtered to the position that team needs, and the user clicks the player.
- **Undo last pick** is available.
- The draft ends when every D2 team has one player at each of the five positions. Leftover draft-pool players go to Reserves.

## 6. Data additions

All new data is JSON validated by strict zod schemas and registered in `schemaRegistry`:

| Document | Contents |
|---|---|
| `RosterEntry.restricted?: boolean` | Imported from bold and underline formatting in the "FBA Rosters" tab |
| `leagues/fba/S79/freeAgents.json` | The FA pool: `{ playerId, position, age, rating \| null, kind: 'fa' \| 'rookie', note }` |
| `leagues/fbad2/S79/reserves.json` | The D2 Reserves pool: `{ playerId, position, age, rating \| null }` |
| `leagues/fbad2/S79/pool.json` | The D2 pool with D2 ratings, the drag order per position, and the locked flag |
| `leagues/fbad2/S79/draft.json` | The draft order, picks made, and the finished flag |
| `leagues/fba/picks.json` | Pick obligations (§4) |
| `leagues/<league>/S79/transactions.json` | Ordered entries `{ seq, type, teams, lines[] }`. Types: signed / released / cut / trade / edit / drafted / d2-pool. Each entry also records the batch id for undo. |
| `players.json` | New players from the FA tab and Reserves get new ids |

**Refresh from sheets** (`npm run import -- --refresh-rosters`):
- Rebuilds the S79 FBA and D2 rosters, `freeAgents.json`, `reserves.json`, and `picks.json` from the sheets.
- Keeps existing player ids by seeding the registry from `players.json`.
- Refuses to run once any transaction exists in the app.
- Sources: the "FBA Rosters", "FBA D2 Rosters", and "Free Agents S79" tabs of the Rosters sheet, and the S80–S83 tabs of the FBA Draft History sheet.

## 7. Saving, atomicity, and undo

- **`POST /api/batch`** takes `{ label, writes: [{ path, doc }] }`. It validates every doc (schema, path allow-list, and body/path agreement), then refuses the whole batch if any check fails.
  - **Body/path agreement:** a doc's `league` and `season` fields must match its path (this carries over review item I4).
  - If all checks pass, it writes each file atomically. Writes to the same path are queued so they never interleave.
- Before writing, each batch saves the previous content of every file it touches as a journal entry in `web/data/.journal/` (gitignored).
- **`POST /api/undo`** restores the most recent journal entry, but only if the files it covers are unchanged since that batch; otherwise it returns 409 with an explanation. The UI's **Undo last move** calls it.
- The existing single-document `PUT` stays for simple edits like the calendar.

## 8. Screens

- **FA market** (`/league/fba/free-agency`):
  - One sortable list of everyone signable: free agents, D2 players, unrated rookies, and unrestricted expired contracts (tagged with their team).
  - Filters for position and type, plus a **team filter dropdown**. With a team selected, the page shows that team's roster, open slots, payroll bar, and needs.
  - The sign panel is described in §3.2.
  - A **Close free agency** button, with a checklist of anything that blocks it.
- **Trade builder** (`/trade`): a column per team with its players and pick obligations. Clicking an asset sends it. Each team's after-trade payroll and slots are shown, the pick condition prompt appears when a pick is sent, and the summary uses the sheet's format.
- **Team pages** gain a payroll bar (FBA), Release/Cut/Edit on each row, a **Trade…** button, and restricted and expired tags.
- **D2 rating editor** and **D2 draft board**, as in §5.
- **Transactions** tab on each league, and **Undo last move** in the top bar after any move.

The visual style follows the Foundation spec (light default, dark toggle, sidebar).

## 9. Error handling

- Rule violations are shown inline before submit, and the submit button explains what blocks it.
- Server-side rejections from the batch endpoint are shown as a toast listing the issues. Nothing is partially saved.
- A failed undo (409) explains which file changed since the move.
- Import rows the importer can't parse (unknown pick text, a missing team) are listed in the import report as errors; nothing is written.

## 10. Testing

- **Rules:** cap, per-player max, length limits (new vs re-sign), years ≤ dollars, rookie scale incl. the cap-room case, restricted vs unrestricted expiry, D2 player re-rate, and slot checks at checkpoints vs warnings during free agency.
- **Trades:** cap block, multi-team destinations, pick condition encoding, and log lines matching the sheet's format.
- **Picks:** `resolvePicks` against the real DCB→OV/NY cases:
  - protected rolls with shrink
  - already-owed rolls with shrink
  - lottery → top-(size−1)
  - swaps
  - custom flagged
- **D2:** ranking tie-break, cutoff at 64, bumped roster players, drag overrides, draft order randomization with an injected RNG, the pick must match the needed position, and completion.
- **Batch/undo:** all-or-nothing on a bad doc, body/path mismatch rejected, write queue ordering, undo restores, undo refused after an intervening change.
- **Import:** restricted formatting, the FA tab sections, Reserves, pick rows (including "Originally LP", "priority N"), and id preservation on refresh.
- **UI:** sign, trade, and draft flows with a stubbed API, plus a browser check on real S79 data.

## 11. Out of scope

These are recorded for later parts:
- **FBA draft and draft lottery:** will use `resolvePicks`.
- **JC recruiting and class creation.**
- **Schedules and season play (2b):** 2b's brainstorm should decide whether D2 season play is built alongside FBA, since the calendar plays D2 first.
- **Season-level locks and season rollover:** the Foundation review's I5 and S2.
- **History import of old transactions:** part 3.
