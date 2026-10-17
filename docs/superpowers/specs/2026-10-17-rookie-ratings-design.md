# Rookie ratings: a separate step after the FBA draft

The draft class is no longer part of the pro ratings reset. The draft runs without FBA ratings, and a new calendar step right after it rates the rookies from the top of the prospect rankings. Anyone who is not rated goes to the FBAD2 draft pool in rank order and is not eligible in FBA free agency.

## Why
Prospects used to be ranked together with the FBA players in the pro ratings reset, which handed them their FBA ratings before the draft; the draft could not start until each had one. In practice the commissioner rates the draft class separately and only after the draft, from the top of the prospect rankings, and stops where the talent runs out (nothing is rated below 55). Players who get no rating are not FBA players: they wait, in rank order, for the FBAD2 draft.

## Goals
- The pro ratings reset ranks FBA players only.
- The FBA draft starts and runs with no FBA ratings on the prospects.
- A new calendar step, **Rate S{n} Rookies**, sits after the FBA draft and before Free Agency/Offseason. It rates the draft class in prospect-ranking order.
- Rated players keep their rating; unrated players go to the D2 draft pool in rank order and never reach FBA free agency.

## Non-goals
- No change to the draft order, the lottery, rookie contract terms, or the prospect rankings and their arrows.
- No change to how FBA free agency works for players who are rated.
- No change to the D2 reset or the D2 draft themselves: unrated players simply arrive in the D2 Reserves the way free agents who went unsigned do.

## The flow (decided by the commissioner)
1. **Pro ratings reset (S{n}).** Rows are the FBA roster players only. The draft prospects are not rows, are not ranked, and get no rating here. Finishing it no longer writes ratings to prospects.
2. **The draft.** It can start once the pro ratings reset is finished and the lottery is drawn; the "has no FBA rating" blockers are gone. A drafted player joins the drafting team's roster with no rating yet.
3. **Rate S{n} Rookies** (new step, `s{n}-rate-rookies`, after `s{n}-fba-draft` and before `free-agency-offseason`). The page lists every prospect in the prospect-ranking order (`rankedProspects` with the saved manual order), each row with its rank, name, position, school, who drafted them (team and pick) or "Undrafted", and a rating box. The commissioner types ratings from the top down: whole numbers from 55 to 99. Rating stops where he chooses; everyone below the last rated player is unrated.
4. **Finishing the step.** Rated drafted players keep their rating on the team that drafted them. Rated undrafted players join the FBA free-agent list with that rating (rookie, undrafted). Unrated players of either kind leave any FBA roster and are added, in rank order, to the S{n} D2 Reserves (`fromFba`, rating null, no FBA rating); they are not on the FBA free-agent list. The step is marked done on the calendar.

## My calls (flag to the commissioner)
- Ratings must be contiguous from the top (no unrated player above a rated one) and must not rise as you go down the list (a rating above the one above it blocks Finish, the way the ranking tool flags "rated above a player ranked higher").
- A rated undrafted player goes to FBA free agency with his rating (the commissioner said only unrated players are ineligible).
- A drafted player left unrated loses his roster place; the draft pick stays in the draft history.

## Edge cases
- A prospect declared, sent back to school or sent to the portal before the draft is not in the class; one who goes back during this step is not possible (the draft has finished).
- Before the step is done, FBA free agency is not open to the class: the calendar order enforces it (free agency comes after this step).
- A season whose calendar already contains the step, or one whose draft is finished before the step existed: the calendar helper adds the step only when the draft step is not yet done; otherwise it is left alone.
- An existing S80 draft file that holds prospects with a typed FBA rating keeps it; the rating step starts those boxes with that value.

## Constraints
- Engine code is pure and tested first; moves return `{ ok, writes, label }` or `{ ok: false, problems }`; saves go through the existing versioned write path.
- `calendarFor(n)` gets the new step; a `withRookieStep` helper adds it to a live calendar, with an importer flag (`--rookie-step`) for the real data, as the expansion step did. Code and tests never write `web/data`.
- The new step's page route follows the existing step-route mapping (`app/stepRoutes.ts`).
- No schema change to saved documents beyond what the rating step needs (a place to keep the typed ratings until Finish: an optional `rookieRatings` map on the draft document).

## Left to the builder
- The page layout (follow the draft page and the ranking table look), validation wording, and where the typed ratings are held between visits (the draft document's optional map, saved on blur like the old board rating box).
- How the roster slot freed by an unrated drafted player is expressed (an empty slot at his position).

## Not verified
Nothing is built. Not checked in a browser.
