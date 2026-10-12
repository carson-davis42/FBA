/** Playoff seeds per conference. */
export const PLAYOFF_SEEDS = 8;

/** Non-playoff teams in a two-conference league: the size of the draft lottery when no expansion team joins it. */
export const lotterySizeFor = (teamCount: number): number => Math.max(0, teamCount - 2 * PLAYOFF_SEEDS);
