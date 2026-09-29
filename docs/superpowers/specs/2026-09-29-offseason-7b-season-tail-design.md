# Part 7b: season tail (lottery, retirement, Hall of Fame)

Branch `season-tail`. The rules are ledger decisions D7, D14–D17 in `.superpowers/sdd/progress.md`; this spec only adds the design choices.

Three calendar steps come after the FBA step, in this order: **S80 FBA Draft Lottery → Retirement → Hall of Fame Induction**. Each one has an engine module, a page and a commit that goes through `commitDocs` and marks its calendar step done in the same batch. The engine refuses each commit out of calendar order and refuses it again once the step is done.

## 1. Draft lottery

Engine `engine/offseason/lottery.ts`, page `/league/fba/lottery`.

- **Input:** the final S79 FBA standings, `standings('fba', …).lottery` (worst first), and the S79 playoffs file for the champion. The lottery size is that list's length; nothing assumes 14 (D15).
- **Odds:** `LOTTERY_ODDS: Record<number, number[]>` holds only the size-14 S74 table (14/14/14/12.5/10.5/9/7.5/6/4.5/3/2/1.5/1/0.5). Teams tied on W-L share the average of their slots' odds, unrounded. If there's no table for the size, the page shows "No lottery odds for an N-team lottery" and can't run.
- **Draw (D14):** with an injected `Rng`, pick 1 is drawn by the odds, the winner is removed and the rest are re-normalised, down to the last pick.
- **Full S80 order (D7):** the lottery result first. Then the playoff teams, worst first by regular-season record, using the same record comparison as the lottery order (`betterThan`). The FBA champion always goes last.
- **Picks:** `resolvePicks({ season: 80, order, lotterySize, obligations })`. Conveyed picks record their new owner. Protected or already-owed picks roll to S81 with protection shrunk; `picks.json` is rewritten with the rolled obligations. Flagged picks (custom conditions, or a swap that is also owed) are listed with their flag, for the commissioner to settle by hand in the existing picks editor. `resolvePicks` must also fail loudly for a team that isn't in the order (a carried-over note).
- **Saved:** `leagues/fba/S79/lottery.json`, locked. A new strict schema and registry path hold the odds per team, the drawn order, the full order and the resolved picks (`slot`, `originalTeam`, `owner`, `obligationId`, `flag`). A transaction line reads "S80 Draft Lottery: <TEAM> wins the first pick".
- **Final:** Undo stops at the lottery (user, 2026-09-29). The server refuses to undo the move that wrote `lottery.json`, and the Undo button explains that it is final. Later moves still undo.
- **Page:** before the draw, it shows the odds table. "Run lottery" draws and saves; the reveal then goes from the last lottery pick up to pick 1 with "Reveal next" and "Reveal all". Reveal progress lives only in component state, so after a reload everything shows. Under the lottery it lists the full order with owners ("via TEAM").

## 2. Retirement

Engine `engine/offseason/retirement.ts`, page `/retirement`.

- **Auto list (D16):** everyone on FBA rosters, D2 rosters or D2 Reserves with `season − birthSeason ≥ 32`. These are always retired and can't be unchecked.
- **Early retirements:** a name search over the same three pools adds younger players, and each added player can be taken back out.
- **Unknown ages:** players with a null `birthSeason` appear in a warning list and are never auto-retired (they can be added by hand).
- **Commit "Retire N players":**
  - Removes each player from their roster or Reserves, and a contract leaves the cap with no buyout. A roster spot becomes vacant in the same form the roster editor uses for an empty slot.
  - Sets `Player.retired = { season, league: 'fba' | 'fbad2', team: string | null, pos }` (a new optional strict field).
  - Writes one transaction line per league and marks the step done.
- **Lock exception:** the retire move is gated only by the Retirement step being the current calendar step, and it doesn't consult `lockProblem`. Every other roster move stays locked in the tail.

## 3. Hall of Fame

League doc `leagues/fba/hallOfFame.json` (a new strict schema and registry path), page `/league/fba/hall-of-fame` with **Hall** and **Nominees** tabs.

- **Shape:** `{ league: 'fba', classes: [{ season, inductees: Card[] }], nominees: Card[], removed: { name, playerId | null }[] }`. A Card is `{ name, playerId: string | null, retiredSeason: string, lines: string[] }`. `retiredSeason` and the class `season` are text because the sheet has "FFL" and "S--".
- **Import:** a one-time mode, `npm run import -- --hall-of-fame`, reads the sheet's Hall of Fame tab from an xlsx path. It parses the year headers into classes and the "Nominees(Keep 15)" section into the nominees, matches names to `players.json` where it can and writes the doc. It is tested on a small fixture. The user runs it against the real data; tests and browser checks never touch `web/data`.
- **Candidates:** the Nominees tab lists candidate retirees: this season's new retirees first, then earlier retirees (any league) who aren't already a nominee, an inductee or on `removed`. The commissioner ticks the ones to add; a free-name entry covers anyone the app doesn't know.
- **Prefilled card:** the name and the retirement season, the player's last team as "TEAM: …-S79" (the start is left for the commissioner to fill in), and any S78–S79 awards found in the season summaries. The lines are editable text. Part 3 will regenerate cards from full history.
- **Hard cap of 15 (D17):**
  - Adding past 15 is refused until the commissioner removes someone.
  - A removal asks for confirmation and puts the name on `removed` for good.
- **Induct:** tick exactly 3 (or every nominee, if fewer than 3 remain), then "Induct". They move into the S79 class, one transaction line lists the class, and the step is marked done.
- **Hall tab:** classes newest first, each card showing its name, retirement season and lines. Plain styling.

## 4. Calendar and routes

The three offseason steps map to the pages in `stepRoutes`. Their "Mark done" buttons are replaced by the tools, the same way the 7a tools replaced them. A sidebar link reaches the Hall of Fame page at any time.

## 5. Testing

- **Engine:**
  - Odds normalisation, tie averaging and a missing table.
  - The draw is deterministic for a seed.
  - A simulated distribution for pick 1 roughly matches the odds.
  - Order assembly, including the champion last.
  - Pick resolution is wired in, and an unknown team throws.
  - Retirement: the age rule, null ages, removal from all three pools and the `retired` stamp.
  - The lock exception, both when the Retirement step is current and when it isn't.
  - HOF: candidates, the cap, removed names that can't come back, induction counts.
  - Every commit refuses out of calendar order.
- **Importer:** fixture parsing (classes, "FFL", multi-line cards, nominees).
- **Pages:** one jsdom smoke test each (the lottery reveal, retire commit, add-and-induct).
- **Browser check:** text-only, on scratch data (`prep.mjs` roster fill, with the calendar and season results staged on the scratch copy only).

## 6. Out of scope

The FBA draft itself (7d), expansion odds (FBA expansion part), full career lines and HOF styling (part 3).
