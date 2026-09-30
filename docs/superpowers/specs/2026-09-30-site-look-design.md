# Site look: a sports-site visual overhaul

This part sits between 3b and 3c. It restyles the whole web app so that it reads like a big sports network site: a real header with a results ticker, team logos and colours everywhere, hero headers, sticky tabs, dense stat tables, and cards, chips and badges instead of bare lists. It borrows the *feel* of such sites only; it never uses ESPN's name, logos or branding.

**Presentation only.** There are no engine, schema, save-path or `web/data` changes. New components read existing docs only through `useDoc`. There are no new npm dependencies and no new fonts (Inter and Barlow Condensed are already loaded in `web/index.html`).

## Decisions

| # | Decision |
|---|---|
| L1 | **Team colours come from a presentation-only table** in app code (`app/components/teamColors.ts`), hand-picked from each team's current logo. Teams missing from the table (D2, JC, WC, anything new) fall back to `team.badge.bg`. |
| L2 | **The ticker is context-aware:** Game Day finals in the regular season, series scores in the playoffs, and the champion, awards and next step in the offseason. |
| L3 | **The sidebar is replaced by a top header** (masthead, ticker, sticky section nav). |
| L4 | **Barlow Condensed is the display face in both themes** (headlines, hero names, scores, big numbers; uppercase, heavy). Body text and tables use Inter with `tabular-nums`. |
| L5 | **Design system first, then page groups.** Task 1 builds the tokens and shared components; tasks 2–7 restyle one page group each using only those parts. |
| L6 | **`LeagueTabs` is retired.** Its links move into the header's section nav. Page-level `SubNav` is for sections within one page. |
| L7 | **`/offseason` becomes a hub** of link cards to the existing offseason tools. It has links only and reads only `calendar.json` (to mark the current step). |

## 1. Design system (Task 1)

### Tokens (`web/app/theme.css`, both themes)

- Spacing: `--s1`…`--s6` = 4, 8, 12, 16, 24, 32px.
- Type scale: `--fs-xs` 11, `--fs-sm` 12, `--fs-base` 14, `--fs-md` 16, `--fs-lg` 20, `--fs-xl` 28, `--fs-display` 44 (32 below 760px).
- Radii: `--r-sm` 4, `--r` 8, `--r-lg` 12. Shadows: `--shadow-1` (cards), `--shadow-2` (hover lift, menus).
- Motion: `--dur-fast` 120ms, `--dur` 200ms, `--ease` `cubic-bezier(.2,.7,.2,1)`.
- Colours added to the existing set: `--row-alt` (zebra), `--row-hover`, `--masthead-bg` (`#121417` light, `#070b18` dark), `--masthead-text`, `--focus` (the accent), `--gold`, `--silver`, `--bronze`.
- `--font-head` is `'Barlow Condensed', Inter, sans-serif` in both themes, and `--head-transform: uppercase` in both.
- `:focus-visible` shows a 2px `--focus` outline with a 2px offset on every interactive element.
- `@media (prefers-reduced-motion: reduce)`: every transition and animation duration is 0.

### Team colours (`app/components/teamColors.ts`)

`TEAM_COLORS: Record<teamId, { primary: string; secondary: string }>` for the FBA. `teamTheme(team)` returns `{ primary, secondary, ink }`. The fallback is `primary = secondary = team.badge.bg`. `ink` is `#fff` or `#111` by the WCAG relative luminance of `primary` (white when luminance ≤ 0.45). Pages set the colours as inline CSS variables `--team`, `--team-2` and `--team-ink` on the hero or page wrapper.

Picks (sampled from each `… pres.` logo; **?** marks a guess because no current-era logo file exists):

| teamId (name) | primary | secondary |
|---|---|---|
| ATL Atlanta Venom | `#B01818` | `#111111` |
| BOS Boston Bucks | `#1A1A1A` | `#C8C8C8` |
| CAR Carolina Knights | `#16204A` | `#D4AF37` |
| CHI Chicago Spartans | `#173552` | `#6FB2D8` |
| CIN Cincinnati Blue Stripes | `#16207A` | `#F07A1A` |
| CP Columbus Pirates | `#3A1638` | `#8E4A6E` |
| CGG Cypress Green Guns **?** | `#2F5A32` | `#E8CF8F` |
| DCB | `#E01818` | `#111111` |
| DEN Denver Heights | `#3A1A12` | `#B07232` |
| DET Detroit Motors | `#16203E` | `#F04A30` |
| FLO Florida Panthers | `#10162E` | `#4FCFCF` |
| HON Honolulu Rays | `#127272` | `#F09434` |
| LA Los Angeles Hawks | `#111111` | `#F2B516` |
| MW Maine Wildcats | `#173C74` | `#6FB2F0` |
| MAN Manhattan Magic | `#4F2F92` | `#D2743A` |
| MEM Memphis Blues | `#173A58` | `#4FB2F0` |
| MIL Milwaukee Warriors | `#123A38` | `#F2B430` |
| MON Montreal Chevaliers | `#173552` | `#1A92F0` |
| NO New Orleans Seminoles **?** | `#111111` | `#F2B416` |
| NY New York Icons | `#2F6FD6` | `#333333` |
| OAK Oakland All-Stars | `#3F7F3F` | `#F2B416` |
| OV Ohio Valley Sharks | `#7A1A34` | `#8FB0D0` |
| PHX Phoenix Badgers | `#6A2FA8` | `#F07A1A` |
| SAS San Antonio Spirits | `#111111` | `#B07232` |
| SEA Seattle Shock | `#127A16` | `#111111` |
| STL St.Louis Kings | `#D81834` | `#333333` |
| TEX Texas Outlaws | `#8E1616` | `#EFEFD0` |
| TOR Toronto Wolves | `#F07A16` | `#111111` |
| VAN Vancouver Orcas **?** | `#1A1A1A` | `#903030` |
| VEG Vegas Volts | `#E0661A` | `#111111` |

The table is keyed by `teamId` (as in `web/data/leagues/fba/teams.json`; the user changes any pick later by editing this one file). The expansion teams (Philly Phantoms `#173C74`/`#D23434`, Los Angeles Labradors `#3A3A12`/`#F0D2B0`) are added when the expansion part creates their teams, not now.

### Shared components (`app/components/`, styles in the new `app/ui.css`, imported once in `main.tsx`)

| Component | What it does |
|---|---|
| `TeamName` | Logo (`TeamMark`) plus name. Props: `team`, `season`, `variant: 'full' \| 'short' \| 'abbr'`, optional `to` (link), `size`. Used in every table, list and bracket. |
| `Hero` | A band with a `--team` → `--team-2` gradient (or the `--hero-from/--hero-to` league default), a big logo or monogram, a kicker line, a display title, optional children, and a row of `StatTile`s. At 375px it stacks and the logo shrinks to 56px. |
| `StatTile` | A big number with a small label. |
| `SubNav` | A sticky (`top: var(--nav-h)`) horizontal tab strip with an accent underline on the active item. It takes route links (`NavLink`) or in-page buttons (`role="tab"`, `aria-selected`). It scrolls sideways on phones and keeps the active item in view. |
| `.stat-table` | Dense rows, zebra (`--row-alt`), row hover, right-aligned `.n` / `.num` cells with `tabular-nums`, an uppercase `--fs-xs` header, and a rank column style. Long tables sit in `.table-wrap.tall` (`max-height: 70vh; overflow: auto`) so the sticky `thead` works inside the sideways-scrolling wrapper. |
| `useSort` + `SortTh` | `useSort(rows, initialKey, initialDir)` returns sorted rows plus `sortProps(key)`. `SortTh` is a `<th>` with a button, an arrow, and `aria-sort`. It sorts numbers numerically and text with `localeCompare`, keeps ties stable, and puts empty values last. Used only where sorting makes sense (listed per page below). |
| `.card` variants | `.card` (existing), `.card.headed` (a 3px accent or `--team` top rule plus a display header), `.card.link` (hover lift with `--shadow-2`, focus ring). |
| `Chip` / `.chip` | A small rounded filter or info chip. `.chip.active` is accent-filled. `.chips` is the wrapping row. |
| `Badge` / `.badge` | Honour and status badges: `champion` (gold), `mvp`, `finals-mvp`, `all-star`, `all-fba`, `hof`, `clinched`, `eliminated`, `final`, `live`, `current`. |

Existing class names (`card`, `btn`, `n`, `num`, `muted`, `table-wrap`, `chips`, `tabs`, `pill`, `team-mark`, `team-badge`) keep working, so pages can migrate one group at a time.

### Motion

`Layout` wraps the outlet in an element keyed by `location.pathname` with a `page-in` animation (fade plus 6px rise over `--dur`). `SubNav` in-page tabs animate their panel the same way. Link cards lift on hover. All of this is off under reduced motion.

## 2. Site shell (built in Task 1)

`Sidebar.tsx` is deleted. `TopBar.tsx` becomes `SiteHeader.tsx`, with three rows:

1. **Masthead** (48px, `--masthead-bg`, scrolls away):
   - the FBA logo and "FBA Universe" (the text hides below 760px);
   - the league switcher: chips for each of `LEAGUES` with `LEAGUE_LABEL`, linking to `/league/<id>`, with the current league accent-filled;
   - a spacer;
   - the season and step pill, which links to `/calendar`;
   - the Undo button (keeps its current behaviour and accessible name; the text label hides below 760px);
   - the theme toggle.
2. **Ticker** (`Ticker.tsx`, about 52px, `--surface-2`): a label cell and then a row of chips with sideways scroll and scroll snap. ◀ ▶ buttons appear only when the row overflows, and only at ≥ 760px. The items come from a pure function `tickerItems(input) → { label, items: TickerItem[] }` in `tickerItems.ts`:
   - **Regular season:** the latest Game Day with any finished game. Each chip shows both teams' abbreviation and logo and the score, with the winner bold, and links to `/league/<lg>/game/<n>`.
   - **Playoffs:** each active or finished series in the latest round ("ATL 3–2 BOS"), linking to `/league/<lg>/playoffs`.
   - **Offseason / season complete:** the champion (a champion badge), the Finals MVP, the MVP and the other award winners that are decided, and a "Next: <step label>" chip linking to that step's route (`stepRoutes.ts`).
   - **Nothing to show:** a single muted "No results yet" chip.
   - It is only shown for the FBA and D2. For the JC and WC it shows the "Next" chip only.
   Task 1 finds the exact docs and fields by grepping the existing Scores, Playoffs and Awards pages and reuses their hooks (`useSeasonState` etc.). It reads only; it never saves.
3. **Section nav** (44px, `position: sticky; top: 0`, `--surface`, accent underline on the active link). It shows:
   - the current league's sections, the same set `LeagueTabs` shows today: FBA/D2 = Scores, Standings, Playoffs, Awards, Rankings, Teams, Transactions; JC = Teams, Recruiting; WC = Teams;
   - a divider;
   - the global links: Calendar, Offseason, History and Hall of Fame (`/history/fba/hall-of-fame`).
   It scrolls sideways on phones and keeps the active link in view (the existing `LeagueTabs` effect). It sets `--nav-h: 44px` on `:root` for `SubNav`'s sticky offset.

**The current league** is the `:league` URL segment (`/league/:league/...` or `/trade/:league`). Otherwise it is the last league visited, stored in `localStorage` (`fba-last-league`, read and written inside try/catch; a per-viewer convenience only), with a default of `fba`. `/history/**` counts as `fba`.

`LeagueTabs.tsx` and its test are deleted. Every page that rendered it drops it; tests that clicked those links query the header nav instead.

The layout at ≥ 760px has a max content width of 1280px, centred, with `--s5` gutters. Below 760px it is full width with 16px gutters. No page scrolls horizontally at 375px; wide tables and brackets scroll inside their own wrapper.

## 3. Page groups

Every group applies: `TeamName` wherever a team appears (including plain-text abbreviations in tables), `.stat-table` on every data table, a page header (display `h1` plus a muted kicker) or a `Hero`, cards, chips and badges instead of bare `ul`/`p` lists, and consistent `--s*` spacing. Interactive controls keep their accessible roles and names so that behaviour tests keep working.

| Task | Pages | Treatment |
|---|---|---|
| T2 Shell pages | `Home`, `CalendarPage`, the `/offseason` hub (new `OffseasonHub.tsx`), `NextSeasonPage`, `Placeholder` | **Home:** a league-default `Hero` ("Season N · step", a big **Continue ▸**), league cards (logo, phase badge, leader or champion), and a "Latest results" card (the same `tickerItems`). **Calendar:** a vertical timeline of step cards grouped by phase, with `done` / `current` / `upcoming` badges. **Offseason hub:** `.card.link` grid grouped by league, with a `current` badge on the card that matches the calendar step. **Next season:** step cards. |
| T3 League and teams | `LeaguePage`, `TeamPage` (+ `TeamActions`), `RosterTable`, `PayrollBar`, `FreeAgencyPage`, `SignPanel`, `TradePage`, `TransactionsPage`, `EditDialog` | **League:** team grid of `.card.link` tiles with a `--team` top rule. **Team:** a `Hero` in the team colours (logo, name, record, seed and payroll tiles) and a `SubNav` (Roster \| Schedule \| Stats, where the page has those sections). **Rosters:** sortable (name, position, ratings, salary). **Payroll bar:** a restyled meter. **FA:** market cards, sortable player table. **Trade:** two team panels with team colour rules. **Transactions:** a feed with a date rail, logos and move-type badges. |
| T4 Season play | `ScoresPage`, `SchedulesPage`, `GamePage`, `GameViews`, `LiveGame`, `StandingsPage`, `RatingPausePage`, `AllStarPage` and its steps | **Scores:** a scoreboard grid of game cards per Game Day (logos, scores, `final` / `live` badge). **Game and live game:** a scorebug in team colours, a line score table, the play-by-play feed, and box scores as sortable stat tables. **Standings:** conference stat tables with seed numbers and `clinched` / `eliminated` badges (not sortable; the order is the tiebreak order). **All-Star:** step cards, dice and draw reveals restyled, and the rosters as team-coloured cards. |
| T5 Postseason | `Bracket`, `PastBracket`, `PlayoffsPage`, `PlayoffGamePage`, `FinalsMvpCard`, `FinishSeasonCard`, `AwardsPage`, `RankingsPage` | **Brackets:** matchup cells with logo, seed, series score and a winner highlight, keeping the mirrored layout and its own sideways scroll. **Awards:** race cards with a leader spotlight and odds bars. **Rankings:** a list with rank, movement arrows and logos. |
| T6 Offseason tools | `LotteryPage`, `FbaDraftPage`, `RetirementPage`, `HallOfFamePage`, `ProRatingsPage`, `AdjustAgePage`, `D2RatingsPage`, `D2DraftPage`, `DraftBoard`, `PoolBuilder`, `RecruitingPage`, `BoardTab`, `ClassTab`, `SetupPanel`, `PortalPage`, `PortalBanner`, `ClassRankingPage`, `CollegeRatingsPage`, `RankingTable`, `RatingInput` | A page header, card panels, stat tables, chip filters, and draft or lottery boards with logos. Sort only on read-only lists (not on click-to-rank tables, whose order is the data). |
| T7 History | `HistoryHome`, `ChampionshipsPage`, `SeasonHistoryPage`, `AwardsHistoryPage`, `AwardsByPlayerPage`, `LeadersPage`, `PlayersHistoryPage`, `PlayerHistoryPage`, `CareerSection`, `PlayerLink`, `HallOfFameHistoryPage` | **Hub:** feature cards (Championships, Awards, Leaders, Players, Hall of Fame) and a grid of season chips. **Championships:** a champions timeline with logos and a Finals MVP badge. **Season:** a `Hero` in the champion's colours (record, MVP), plus a `SubNav` (Standings \| Playoffs \| Awards \| All-Star, for the sections that exist). **Player:** a `Hero` in the colours of the player's most recent team (position, career tiles, honour badges), and the career table. **Players directory:** a searchable, sortable table plus letter chips. **Awards history and by player:** cards per award, winners with badges, sortable counts. **Leaders:** leaderboard cards with rank 1 highlighted. **HOF:** plaque cards. |

The exact CSS lives in `ui.css` (shared) and the existing per-area files (`pages/*.css`, `college/college.css`, `rank/rank.css`), which are rewritten on top of the tokens. New area files are allowed where a group needs one (`history/history.css`, `playoffs/playoffs.css`).

## 4. Testing and checks

- **New unit tests:** `teamTheme` (table hit, fallback, ink by luminance), `useSort` (toggle, numeric vs text, stable ties, empties last), `TeamName` (variants, link), `SubNav` (active item, `aria-selected`), `tickerItems` (regular season, playoffs, offseason, empty), and `SiteHeader` (current league from the URL and from storage, Undo still works; this replaces the `TopBar` and `LeagueTabs` tests).
- **Existing tests keep passing.** Queries change only where markup legitimately moves. `npx tsc --noEmit` prints nothing after every task.
- **Browser checks after each task,** on scratch data only (Vite 5183 via `web/rscheck.vite.config.ts`, data server 5184 via `.superpowers/sdd/rscheck/server.ts`, prep via `prep.mjs`):
  - each page in the group at desktop width, 375px and dark mode;
  - JS reads for: no horizontal page scroll at 375px (`scrollWidth <= innerWidth`), the sticky nav and `SubNav` offsets, `:focus-visible` outline, `aria-sort`, animation duration 0 under emulated reduced motion (spot check once), and no console errors;
  - at most three screenshots per group, at scale 0.5.
  Afterwards: stop both processes, delete the scratch data and config, and confirm `git status` is clean.

## 5. Out of scope

- New data, new pages beyond the `/offseason` hub, and new features (for example a real Schedule tab for teams that don't have one now).
- Real team colours for D2, JC and WC teams (they use their badge colours).
- A UI library, icon font or new web font.
