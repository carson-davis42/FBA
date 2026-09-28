export type SeasonPhase = 'open' | 'd2-cycle' | 'fba-season' | 'post-deadline';
export type LockedAction = 'sign' | 'release' | 'cut' | 'trade' | 'edit';

export const LOCK_MESSAGES = {
  faClosed: 'Free agency is closed: FBA rosters change only by trade (and Edit) until the season starts',
  d2: 'D2 rosters are locked from the close of free agency until the next offseason',
  season: 'During the FBA season rosters change only by trade, until the trade deadline',
  deadline: 'The trade deadline has passed: rosters are locked until the offseason',
} as const;

export function seasonPhase(input: { freeAgencyClosed: boolean; fbaGamesPlayed: number; deadlineDone: boolean }): SeasonPhase {
  if (!input.freeAgencyClosed) return 'open';
  if (input.deadlineDone) return 'post-deadline';
  if (input.fbaGamesPlayed > 0) return 'fba-season';
  return 'd2-cycle';
}

/** Why this roster action is blocked right now, or null. A missing phase means the offseason (open). */
export function lockProblem(phase: SeasonPhase | undefined, league: 'fba' | 'fbad2', action: LockedAction): string | null {
  if (!phase || phase === 'open') return null;
  if (phase === 'post-deadline') return LOCK_MESSAGES.deadline;
  if (league === 'fbad2') return LOCK_MESSAGES.d2;
  if (phase === 'fba-season') return action === 'trade' ? null : LOCK_MESSAGES.season;
  return action === 'trade' || action === 'edit' ? null : LOCK_MESSAGES.faClosed;
}
