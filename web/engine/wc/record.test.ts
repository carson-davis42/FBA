import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { simGame } from '../season/sim';
import { nextQualifyingGame, recordQualifyingGame } from './qualifying';
import { simTeam, simWcGame } from './state';
import { runFullWorldCup } from './testRun';
import { nextGroupGame, nextKnockoutGame, recordGroupGame, recordKnockoutGame } from './worldcup';

const { stages } = runFullWorldCup(5);

function simFor(rosters: Parameters<typeof simWcGame>[0], next: { gameNo: number; home: string; away: string }, seed: number) {
  const sim = simWcGame(rosters, next, mulberry32(seed));
  if (typeof sim === 'string') throw new Error(sim);
  return sim;
}

describe('recording a watched game', () => {
  it('qualifying: records the next game, and refuses a different one', () => {
    const s = stages.qStart;
    const next = nextQualifyingGame(s);
    if (typeof next === 'string') throw new Error(next);
    const sim = simFor(s.rosters, next, 1);
    const r = recordQualifyingGame(s, sim);
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.state.qualifying!.games).toHaveLength(1);
    expect(r.state.qualifying!.games[0].gameNo).toBe(next.gameNo);
    expect(r.changed).toEqual(['qualifying']);
    const wrong = simGame(next.gameNo, simTeam(next.away, s.rosters.teams[next.away]), simTeam(next.home, s.rosters.teams[next.home]), mulberry32(2));
    expect(recordQualifyingGame(s, wrong).ok).toBe(false);
    const late = { ...sim, gameNo: next.gameNo + 1 };
    expect(recordQualifyingGame(s, late).ok).toBe(false);
  });

  it('group stage: records the next game in order', () => {
    const s = stages.wStart;
    const next = nextGroupGame(s);
    if (typeof next === 'string') throw new Error(next);
    const r = recordGroupGame(s, simFor(s.rosters, next, 3));
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.state.worldCup!.groupGames).toHaveLength(1);
    const after = nextGroupGame(r.state);
    expect(typeof after !== 'string' && after.gameNo).toBe(next.gameNo + 1);
  });

  it('knockout: records the game, advances the winner and numbers the game after the group games', () => {
    const s = stages.wKnockoutStart;
    const next = nextKnockoutGame(s);
    if (typeof next === 'string') throw new Error(next);
    expect(next.gameNo).toBe(193);
    const r = recordKnockoutGame(s, simFor(s.rosters, next, 4));
    if (!r.ok) throw new Error(r.problems.join());
    const slot = r.state.worldCup!.knockout[next.slotIndex];
    expect(slot.game).not.toBeNull();
    expect(slot.game!.gameNo).toBe(193);
    const mismatch = recordKnockoutGame(s, { ...simFor(s.rosters, next, 4), gameNo: 200 });
    expect(mismatch.ok).toBe(false);
  });

  it('refuses when there is no next game', () => {
    expect(typeof nextGroupGame({ ...stages.wStart, worldCup: null })).toBe('string');
    expect(typeof nextKnockoutGame(stages.wStart)).toBe('string');
  });
});
