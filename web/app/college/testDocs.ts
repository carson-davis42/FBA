import { boardPath, type RecruitingState } from '../../engine/college/state';
import { collegeBaseState, collegePros, collegeS78Rosters } from '../../engine/college/testFixtures';

const meta = (fbajc: number) => ({
  currentSeason: 79,
  rosterSeason: { fba: 79, fbad2: 79, fbajc, fbawc: 78 },
  lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 },
});

/**
 * Every document the recruiting page loads once the S79 college rosters exist. The board sits at its own path
 * (S79 for the S80 class, S78 for the class that plays S79). `recruiting: false` leaves the board out (404).
 */
export function recruitingDocs(state: RecruitingState, options: { recruiting?: boolean } = {}): Record<string, unknown> {
  const { fba, d2 } = collegePros();
  const out: Record<string, unknown> = {
    'meta.json': meta(79),
    'players.json': state.players,
    'calendar.json': state.calendar,
    'leagues/fbajc/teams.json': state.teams,
    'leagues/fbajc/S79/rosters.json': state.rosters,
    'leagues/fbajc/S79/transactions.json': state.tx,
    'leagues/fbajc/S78/rosters.json': collegeS78Rosters(),
    'leagues/fba/S79/rosters.json': fba,
    'leagues/fbad2/S79/rosters.json': d2,
  };
  if (options.recruiting !== false) out[boardPath(state.recruiting.season)] = state.recruiting;
  return out;
}

/** The documents before the one-time setup: no S79 college rosters, transactions or recruiting doc; meta.rosterSeason.fbajc as given. */
export function setupDocs(fbajcSeason = 78): Record<string, unknown> {
  const out = recruitingDocs(collegeBaseState(), { recruiting: false });
  delete out['leagues/fbajc/S79/rosters.json'];
  delete out['leagues/fbajc/S79/transactions.json'];
  out['meta.json'] = meta(fbajcSeason);
  return out;
}
