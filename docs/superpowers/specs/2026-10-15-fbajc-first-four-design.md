# FBAJC First Four

March Madness gains a First Four: 8 play-in games before the Round of 64. The field becomes 72 teams: 56 go straight to the bracket and 16 play for the last 8 spots.

## Goal

Like the real tournament, the last teams in the field play an early round. Two groups play it: the power conferences (`MAJOR_CONFERENCES`) and all other conferences. Bracketology shows who is in, who plays, and who is out.

## Selection

`selectMarchMadness` is unchanged and still picks the 64 spots in pick order (its champion locks and the 52-major cap included). The First Four is derived from its result, in a new pure function `selectFirstFour(ranking, field, leftover, confOf)` in `engine/jc/field.ts`.

For each group (power: `isMajor(conf)`, other: not):

1. **Spot holders:** the 4 worst-ranked teams of the group among the 64 (by position in `ranking`). Their pick-order positions, ascending, are the group's 4 spots q1..q4 (q1 is the best seed line).
2. **Challengers:** the first 4 teams of the group in `leftover` (ranking order).
3. **Last eight in:** spot holders and challengers together, sorted by ranking: e1..e8.
4. **Pairs:** adjacent, (e1,e2), (e3,e4), (e5,e6), (e7,e8). Pair k contests spot q_k.
5. **Placeholder:** the better-ranked team of a pair stands in its spot while regions are placed (so conference separation uses its conference).
6. **First Four In:** the 4 teams of the group in the 64 ranked just above the spot holders: they do not play.
7. **First Four Out:** the next 4 teams of the group in `leftover` after the challengers.

The 16 play-in teams are removed from `leftover`, so the NIT is picked from what remains. Play-in losers are out of the postseason (not NIT). A conference tournament champion never plays the First Four (a title guarantees the Round of 64) and is skipped when the spot holders and challengers are chosen. A regular-season champion has no such protection: being picked for the 72-team field is its guarantee, and one that misses the field entirely is still guaranteed the NIT.

## One shared function

`computeField` (`engine/jc/fieldMoves.ts`) gains the First Four, so "Set the fields", swaps and Bracketology all go through it. Bracketology keeps using the same code as the real selection.

## Saved data

`field.mm` in `JcPostseasonFile` (strict zod, `engine/shared/types.ts`):

- `teams` stays 64: the slot order with each play-in spot holding its placeholder. `regions` stays 4 x 16.
- New `firstFour`: `{ id: 'P1'..'P8', group: 'power' | 'other', teams: [placeholder, challenger], seed: 1..16, region: 0..3 }[]`, default `[]` so existing saves load.
- `seeds` also covers the challengers (a pair shares its spot's seed).
- Refinements: either 0 or 8 First Four entries; every pair team is distinct and not elsewhere in `teams`; a placeholder is in `teams`; NIT teams are in neither `teams` nor any pair.

## Bracket

`buildMarchMadness(regions, seeds, firstFour)`:

- 8 new games `P1`..`P8`, round 0, `region` = the spot's region, both seeds = the pair's seed, `next` = the Round of 64 game and side that holds the spot.
- That Round of 64 game starts with that side `null` (seed set, so the card reads "12 TBD") and is filled by the winner through the normal `recordResult`.
- `playableGames` already plays the lowest round first, so round 0 is played before round 1. "Play round" plays all 8.
- `roundName('mm', 0)` is `First Four`.
- The bracket then has 71 games. Game numbers, box scores and stats count like any other tournament game; MVP races use them.
- `pastBracketOf` ignores round 0, so past brackets stay a 64-team, 6-round tree and `mmRoundsFromBracket` still works.

## Swaps

`swapField` (March Madness) replaces a team wherever it appears (slot list or a First Four pair) and re-places the regions. The rule "every conference champion must stay in March Madness" now means "in the 72".

## UI

- **Field tab:** regions as now (a play-in spot shows "Winner of P3"), plus a First Four list of the 8 pairs grouped power and other.
- **March Madness tab:** a "First Four" card list above the region tabs (not a bracket column, so the centred layout of the rounds is untouched). Region and Final Four tabs filter out round 0.
- **Standings clinch bars:** a First Four team counts as in the field.
- **Bracketology:** the bubble becomes, in order:
  1. **First Four In**: power box and other box (4 teams each).
  2. **Last Eight In**: four boxes. Per group, the top four of the eight (games 1 and 2) and the bottom four (games 3 and 4); each box lists its two games as matchups and the seed line the winner takes.
  3. **First Four Out**: power box and other box.
  The bids-by-conference table counts all 72.

## Tests

- `selectFirstFour`: group split, 4+4 spot holders, challengers from `leftover`, adjacent pairs by rank, placeholder = better team, champions can be play-in teams, First Four In / Out.
- `computeField`: 64 slots, 8 pairs, NIT excludes the 16 play-in teams, `projectBracket` equals `setFields` for the same champions.
- Schema: 0 or 8 pairs; old saves (no `firstFour`) still load; the committed `web/data` passes `data.test.ts`.
- Bracket: 71 games; P games feed the right slot and side; round 0 plays first; winners take the pair's seed; `pastBracketOf` unchanged.
- `swapField` with play-in teams; PostseasonPage and Bracketology render the new sections.
- Existing tests that assert 63 games or 64 distinct teams are updated.

## Out of scope

Seeding the two play-in teams by their own seed (they share the spot's seed), a different pairing rule, play-in losers to the NIT, and a First Four column in past brackets.
