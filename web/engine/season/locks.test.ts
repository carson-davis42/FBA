import { describe, expect, it } from 'vitest';
import { editPlayer, releasePlayer } from '../roster/moves';
import { baseState } from '../roster/testFixtures';
import { makeTrade } from '../roster/trade';
import { LOCK_MESSAGES, lockProblem, seasonPhase } from './locks';

describe('seasonPhase', () => {
  it('follows free agency, the FBA season and the deadline', () => {
    expect(seasonPhase({ freeAgencyClosed: false, fbaGamesPlayed: 0, deadlineDone: false })).toBe('open');
    expect(seasonPhase({ freeAgencyClosed: true, fbaGamesPlayed: 0, deadlineDone: false })).toBe('d2-cycle');
    expect(seasonPhase({ freeAgencyClosed: true, fbaGamesPlayed: 5, deadlineDone: false })).toBe('fba-season');
    expect(seasonPhase({ freeAgencyClosed: true, fbaGamesPlayed: 700, deadlineDone: true })).toBe('post-deadline');
  });
});

describe('lockProblem', () => {
  it('matches the spec table', () => {
    for (const a of ['sign', 'release', 'cut', 'trade', 'edit'] as const) {
      expect(lockProblem('open', 'fba', a)).toBeNull();
      expect(lockProblem(undefined, 'fbad2', a)).toBeNull();
      expect(lockProblem('d2-cycle', 'fbad2', a)).toBe(LOCK_MESSAGES.d2);
      expect(lockProblem('post-deadline', 'fba', a)).toBe(LOCK_MESSAGES.deadline);
    }
    expect(lockProblem('d2-cycle', 'fba', 'trade')).toBeNull();
    expect(lockProblem('d2-cycle', 'fba', 'edit')).toBeNull();
    expect(lockProblem('d2-cycle', 'fba', 'sign')).toBe(LOCK_MESSAGES.faClosed);
    expect(lockProblem('d2-cycle', 'fba', 'cut')).toBe(LOCK_MESSAGES.faClosed);
    expect(lockProblem('fba-season', 'fba', 'trade')).toBeNull();
    expect(lockProblem('fba-season', 'fba', 'edit')).toBe(LOCK_MESSAGES.season);
    expect(lockProblem('fba-season', 'fbad2', 'trade')).toBe(LOCK_MESSAGES.d2);
  });
});

describe('moves honor the phase', () => {
  it('blocks a D2 release and an in-season FBA edit, and allows an open-phase release', () => {
    expect(releasePlayer(baseState(), { league: 'fbad2', teamId: 'AMS', playerId: 'p00020', kind: 'released' }, { batchId: 'b', phase: 'd2-cycle' }))
      .toEqual({ ok: false, problems: [LOCK_MESSAGES.d2] });
    expect(editPlayer(baseState(), { league: 'fba', teamId: 'BOS', playerId: 'p00001', changes: { rating: 96 } }, { batchId: 'b', phase: 'fba-season' }))
      .toEqual({ ok: false, problems: [LOCK_MESSAGES.season] });
    expect(releasePlayer(baseState(), { league: 'fba', teamId: 'BOS', playerId: 'p00001', kind: 'released' }, { batchId: 'b' }).ok).toBe(true);
  });
  it('blocks trades after the deadline', () => {
    const r = makeTrade(baseState(), { league: 'fba', teams: ['BOS', 'CAR'], assets: [] }, { batchId: 'b', phase: 'post-deadline' });
    expect(r).toEqual({ ok: false, problems: [LOCK_MESSAGES.deadline] });
  });
});
