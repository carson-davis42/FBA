# FBAJC Bracketology

A projected March Madness bracket on the FBAJC Postseason page, shown until the real fields are set. It updates whenever the rankings update and is built by the same selection code as the real fields.

## Goal

Before "Set the fields", show what the bracket would look like if it were selected now, in the style of ESPN's bracketology: seed lines, regions, last four in, first four out, and bids by conference.

## Rules (single source of truth)

The projection must not re-implement selection. The real step in `setFields` (`engine/jc/fieldMoves.ts`) is:

1. `selectMarchMadness(ranking, champions, confOf)`
2. `selectNit(leftover, rsChampions)`
3. `placeRegions(mmTeams, confOf)` then `buildMarchMadness` / `buildNit`

This is extracted into one function, `computeField(ranking, champions, rsChampions, confOf)`, in `engine/jc/field.ts` or `fieldMoves.ts`. Both `setFields` and the projection call it. `setFields` behaviour and its existing tests do not change.

## Projected champions

- A conference whose tournament is finished uses its real champion.
- Otherwise (including before conference tournaments have started, when `state.postseason` is null) the best-ranked team of that conference in the latest ranking is its projected champion.
- Regular-season champions for the NIT use `ps.rsChampions` when it exists; before that they come from the regular-season standings tables the same way `startConfTournaments` computes them.

## Engine: `engine/jc/bracketology.ts`

`projectBracket(state): Projection | null` (null when there is no ranking yet). Pure; no saving.

```
Projection {
  asOf: { ranking source / day label }
  champions: Record<conf, { teamId, projected: boolean }>
  mm: { teams, seeds, regions, bracket }          // from computeField
  seedLines: string[][]                           // seed 1..16, four teams each
  lastFourIn: string[]                            // last four non-champion teams picked
  firstFourOut: string[]                          // next four of `leftover`
  bids: { conf, count, teams }[]                  // sorted by count desc
  autoBids: Set<teamId>                           // projected or real champions
  nit: string[]                                   // top of the projected NIT field
  warnings: string[]
}
```

Bubble definitions: "last four in" are the last four teams `selectMarchMadness` added that are not in the champion set, taken in pick order; "first four out" are the first four of `leftover` after the field is taken. No separate bubble rules are invented.

## UI

- New **Bracketology** tab on `PostseasonPage`, first in the tab order. It is the default tab while `state.postseason?.field` is null and the stage is before `fields`/`awards`; once the fields are set the tab is hidden and the existing default applies.
- Content: an "as of" line, four regions (seed. team, auto-bid marker, projected-champion marker), the seed-line list, Last Four In / First Four Out, bids by conference, and the NIT teams list.
- The bracket uses `BracketView` with `hrefFor` returning null (read-only).
- Derived with `useMemo` from `state`, so it recomputes whenever the rankings document in state changes. Nothing is written to `web/data`.

## Tests

- `computeField` extraction: existing `field.test.ts`, `fieldMoves.test.ts` stay green.
- Projection equals the real result of `setFields` when the projected champions equal the real champions.
- Fallback: with no tournament finished, each conference's best-ranked team is the champion; finished conferences use the real one.
- Last four in / first four out, bids by conference, seed lines of four.
- Null when there is no ranking.
- jsdom: tab present and default before fields; hidden after fields are set; no Watch links.

## Out of scope

Movement arrows versus the previous ranking, saved projection history, a projected NIT bracket (only its team list), simulated odds.

## Not verified by design

Visual layout is not checked in a browser as part of the build; it is reported as unverified.
