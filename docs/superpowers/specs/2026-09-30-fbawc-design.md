# FBAWC (World Cup), roadmap part 5: design

Status: rules agreed with the user 2026-09-30. Part 5 is split into 5a, 5b and 5c. This spec fixes the rules for all three and details 5a. 5b and 5c get their own plan each (5b/5c details are filled in when they start).

## 1. New World Cup rules (effective S79; add to `docs/fba-rule-changes.md`)

The Java bracket (top 64 of 85 by rating, 4 regions, single elimination) is replaced by:

1. **Qualifying (odd seasons, S79, S81, ...).** The top 15 countries by rating qualify automatically. If the host is not in the top 15, the host replaces #15, and #15 plays qualifying. The other 70 countries each play 6 single games against 6 distinct random opponents (a 6-regular random pairing, 210 games). The top 49 after 6 games advance.
2. **World Cup (even seasons, S80, S82, ...).** 64 teams (15 auto + 49 qualifiers) in 16 groups of 4. Seeded pots by rating, one team per pot per group, host placed in group A. Each team plays each group rival twice (home/away not modelled), 6 games each. Top 2 per group advance to a 32-team single-elimination bracket (group winners meet runners-up of another group, host's group first). Hosts are already set: S80 Mumbai/India, S82 London/England, S84 Glasgow/Scotland, S86 Ottawa/Canada.
3. **Games:** single games everywhere. **Tiebreakers** (qualifying table and groups): wins, head-to-head, point differential, random.
4. **Rosters:** each country's team is the best player at every position among the FBAD2 teams located in that country (e.g. Rome, Venice, Florence, Milan make up Italy). Re-decided each year when the World Cup phase starts. Countries with no D2 city (or a missing position) get generated players, as in the Java version.
5. **Tournament MVP** is a commissioner pick from a tournament-PPG list, like Finals MVP and Series MVP.
6. Qualifying sits in the odd-season calendar at the World Cup step's position; the World Cup step stays in even seasons only.
7. Every standings table (qualifying, groups) uses `app/components/Clinch.tsx` bars and a key. New kinds as needed: "Qualified", "Advanced to knockouts", "Eliminated".

## 2. Parts

| Part | Scope |
|---|---|
| 5a | Flags, World Cup history (S56–S78 plus upcoming hosts), Tournament MVP picks, rule entry. |
| 5b | D2 city→country table (drafted from team names, user corrects), roster derivation, qualifying/group/knockout engine, calendar steps, schemas. |
| 5c | Pages: qualifying, groups, bracket, World Cup team pages, Tournament MVP pick UI. |

## 3. Part 5a design

Sources (read-only): the D2 history sheet tab "D2 World Cups" (`Year | Host City | Host Country | Champions | Runner-Up | Tournament MVP | Date`, S56–S78 played, S80–S86 hosts only), cached in `web/importers/.cache/`; the existing `leagues/fbawc/S78/summary.json` (host, champion, runner-up). The main history sheet has no World Cup tab. Note the tab's S60 runner-up reads "UK" (to map to England, confirm in the dry run).

- **Flags:** each of the 85 `fbawc` teams gets an ISO-3166 code (England/Scotland/Northern Ireland use the GB subdivisions). SVG flags from the `flag-icons` npm package, imported via Vite; a `Flag` component replaces the generated badge for World Cup teams wherever `TeamName`/badges render. Mapping lives in `engine/shared/flags.ts` with a test that all 85 ids are mapped.
- **Data:** `leagues/fbawc/history.json` (strict zod schema, path rule in `schemaRegistry.ts`): `{league, tournaments: [{season, hostCity, hostCountry, champion, runnerUp, mvp: {name, playerId|null}|null, date|null}]}`; hosts-only rows for S80–S86 have null results. Per-season `S<n>/summary.json` stays the S78 shape for `fbawc`, extended with the MVP.
- **Importer:** `--wc-history --data <dir>` in `importers/run.ts`: parses the tab, resolves countries to teamIds (dry-run check: aliases such as UK), resolves MVP names against `players.json` (unresolved stay text, listed in the report), validates before writing. Sheet wins on re-run.
- **Pages** (`app/history/wc/`, reusing `useHistory`, `TeamName`, `PlayerLink`, `HistoryLeagueSwitch` extended to FBA | D2 | WC): hub with champions table (flag, host, champion, runner-up, MVP) and titles-by-country counts; season page for S78 (bracket from the existing archive if present).
- **Tournament MVP pick:** same pattern as Series MVP: the pick control on the World Cup completion flow in 5c; 5a only stores and shows MVPs.
- **Tests:** schema test, flag mapping test, importer parse test with fixture rows, page render tests (`cleanup()` in `afterEach`); `web/data.test.ts` must keep passing.

## 4. Open items for 5b

D2 city→country table; generated-player rating rule for countries without D2 cities; how country rating is computed for the top-15 cut in odd seasons (assumption: the roster derived at that time, same rule).
