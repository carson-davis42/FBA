# Prospect outlook: overall rank, position rank and a stay / withdraw highlight

The Prospects table on the FBA draft page (`app/offseason/FbaDraftPage.tsx`) gets an overall rank, a position rank and a colour that tells an early entrant whether to stay in the draft or withdraw.

## Why
An early entrant should leave college only if they are likely to make an FBA roster. D2 should mostly receive graduated seniors and players falling out of the FBA, so being drafted and landing in D2 is a bad outcome for a player who could have stayed. Going back to school or into the portal is the safe choice, because FBAJC players can count on open spots and on replacing a player.

## Goals
- Every prospect shows an overall rank and a rank within their position.
- Every early entrant (not a senior) shows a green, amber or red highlight, with a legend.
- The page recalculates as players are declared, sent back to school or sent to the portal.
- Three numbers are adjustable on the page, because they vary by year.

## Non-goals
- No estimated FBA rating. College ratings do not convert to FBA ratings (S79: a Sr rated 98 in college started at 74, a Fr rated 95 at 81), so nothing compares a prospect's rating with an FBA player's.
- No team-by-team matching, contract or age signals. Only open and replaceable spots at each position.
- Seniors get no highlight: they graduate regardless. They still count in the ranks, because they compete for the same spots.
- The pro ratings reset and the draft order are unchanged.

## The rules (decided)
**Ranking score.** Each prospect's score is their college rating plus the class boost the draft rankings already use: Fr +4, So +2, Jr +1, Sr 0 (`engine/rank/classBoost.ts`, applied to the class the prospect was in last season). Ties break by the draft board's existing order, then by name. **Overall rank** is the position in that order across all prospects on the board. **Position rank** is the position in that order among prospects at the same position.

**Spots at a position.** Open roster spots at that position now (empty slots in `leagues/fba/S{n}/rosters.json`, counting the expansion teams' empty slots as open) plus the FBA players at that position rated at or below the **replaceable cutoff**, minus the spots reserved for D2 and other non-draftees.

**D2 reserve.** A total of **5** spots (adjustable) is taken off the league's spots and shared across positions in proportion to each position's spots (largest remainder, so the shares add up to 5; a position never goes below 0). D2 players are not guaranteed college-style spots and compete for the same openings; history shows only a few a year (1 to 6 recorded moves a year, about 3 on average), the default is a little above that because of the expansion teams' 10 empty spots in S80.

**The two checks.** A prospect passes the *position check* when their position rank is no greater than the spots at their position. A prospect passes the *history check* when their overall rank is no greater than the **history cutoff**, the number of rookies who usually make a roster (12: the last six drafts had 11 to 13 players make a roster, none later than roughly pick 13 to 20).

**The highlight.** Passing both checks is green (stay), exactly one is amber (close), neither is red (withdraw). Early entrants only.

**Adjustable numbers** (three small number boxes above the table): replaceable cutoff **67** (a player rated 67 or lower counts as replaceable), history cutoff **12**, D2 reserve **5**. They are remembered in the browser, not saved with the league data.

## Appearance
- The Prospects table gains two columns, Rank and Pos rank, after the Class column.
- The highlight is a coloured bar on the left of an early entrant's row, the same look as the standings clinch bars, with a legend under the table (green: likely to make a roster, amber: a close call, red: unlikely to make a roster) and a one-line hover explanation per row saying which checks passed (for example "Position rank 2 of 6 spots; overall rank 9 of 12").
- Seniors' rows have no bar.

## Constraints
- The calculation is pure engine code with no randomness: `engine/offseason/prospectOutlook.ts`, with tests first. The page only renders it.
- No change to saved documents or schemas. No writes.
- Existing behaviour of the declare, back to school and portal buttons is unchanged.

## Left to the builder
- The exact function shape and where the settings state lives (suggested: a small hook with `localStorage`, wrapped in try/catch).
- How the spots shown in the hover are worded.
- Styling and the legend, following the existing clinch bar look.

## Numbers from S80 (for the tests and the first look)
Open spots: PG 3, SG 2, SF 4, PF 5, C 4 (18 in all; 10 are the empty Philly and Boise rosters). FBA players rated 67 or lower: PF 2, SG 1, C 2, SF 5, PG 0 (10 in all). With the D2 reserve of 5, about 23 spots remain across positions.

## Not verified
Nothing is built. Not checked in a browser.
