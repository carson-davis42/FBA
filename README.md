# FBA
Program to simulate a fictional basketball league

## Folder Differences

### FBA
The top professional league

### FBAD2
The division 2 level of the professional league

### FBAJC
College basketball

### FBAWC
The FBA world cup which occurs every other season

## Web app (`web/`)

A browser version of all four leagues. The Java programs above are kept as the reference (git tag `java-v1`).

    cd web
    npm install
    npm run dev        # app on http://localhost:5173, data server on 127.0.0.1:5174
    npm test           # engine, importer, server, and UI tests

League data lives in `web/data/` as JSON and is committed like the old `.txt` files. `npm run import` rebuilt it from the `.txt` files and Google Sheets once. Re-running it needs `-- --force` and overwrites all league data. The design is in `docs/superpowers/specs/2026-09-25-fba-web-design.md`.

### Offseason: free agency and trades
- **Free agency** (`/league/fba/free-agency`): sign free agents, D2 players, rookies, and expired contracts. The app enforces the $25 cap, the $8 max, 4-year new / 5-year re-sign limits, years ≤ dollars, and the rookie scale. **Close free agency** only works when every team has five players (one per position) and is under the cap.
- **Trades** (`/trade/fba`, `/trade/fbad2`): players and conditional draft picks (Top-N, Lottery, Swap, Custom). Picks that don't convey roll to the next season with protection one spot smaller.
- Every move saves all-or-nothing and can be reverted with **↶ Undo last move**.
- `npm run import -- --refresh-rosters` re-imports the S79 rosters, free agents, reserves, and picks from the sheets and keeps player ids. It refuses once moves have been made in the app.
- `npm run import -- --logos` rebuilds the logo list (`web/data/logos/manifest.json`) from `FBA Logos/` after you add or rename logo files, and prints the team folders that changed. It writes nothing else.

### Offseason: the D2 cycle
- **D2 ratings reset** (`/league/fbad2/ratings`, opened by the "FBAD2 Ratings(reset)" calendar step once free agency is closed): every D2 roster player and Reserve gets a suggested new rating (age, last season's scoring vs. rating, ±2 luck). Players with no D2 rating start blank. Each edit saves when you leave the box (or press Enter); **Finish ratings** applies them all at once.
- **D2 pool** (`/league/fbad2/draft`): each position is ranked by the new rating with a line after the top 64. Drag or use ↑/↓ (or Alt+↑/↓) to override. **Lock pool** sends roster players below the line to Reserves and shuffles one draft pick per open roster spot.
- **D2 draft**: the team on the clock picks from the draft pool at any position it still needs. Re-roll the order before the first pick; **Undo last pick** steps back one pick. **Skip pick** appears only when no eligible player is left for that team; once every pick is made, the full pick order is shown as a summary.
- Saves are version-checked: if another tab changed the same data, the save is refused and the page reloads instead of overwriting it.

### Season play (S79 regular season)
- **Schedules** (`/schedules`, the "Make S79 Schedules" calendar step): builds the FBA (86 games per team) and D2 (30 per team) schedules with the Java scheduling rules. You can re-roll until the first game is played.
- **Scores** (`/league/<fba|fbad2>/scores`): game days, Quick-sim next game, Sim rest of day, and Sim to… (a day, the next pause, or the end of the regular season). Every day is saved on its own, so Undo steps back one day.
- **Live game** (Watch): the scorebug, play-by-play, win probability and box score, possession by possession (it slows down in the clutch). It is saved at the final buzzer.
- **Standings**: FBA conferences with the Java clinch markers (`*` #1 seed, `x` playoffs, `n` eliminated) and lottery standings; D2's four leagues.
- **FBA pauses**:
  - after games 322, 645 and 967, a rating editor that suggests ±2 from scoring vs. expectation
  - at 645, the trade deadline (Close trading makes trades read-only for the season)
  - at 967, the All-Star weekend: selections, the captains' draft, the contest draw, the 5pt and dunk contests, the Young-Star tournament, and the All-Star Game on 2d6 dice
- **Roster locks**: after free agency closes, rosters only change as the season allows (FBA trades until the deadline).
