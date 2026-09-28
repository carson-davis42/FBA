import { describe, expect, it } from 'vitest';
import { lockSeeds } from '../playoffs/moves';
import { fullD2State, fullFbaState, regularSeasonDone } from '../playoffs/testFixtures';
import type { SeasonResult, SeasonState } from '../season/state';
import { AwardsFile, type RostersFile } from '../shared/types';
import { awardProblems, lockAwards, setAllFbaSlot, setAward, startAwards } from './awardMoves';
import { races } from './races';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
/** Made-up results have no box scores, so give every player 5 games of points for the races. */
function withBoxes(s: SeasonState): SeasonState {
  const games = s.results!.games.map(g => ({
    ...g,
    box: {
      home: s.rosters.teams[g.home].map(e => ({ playerId: e.playerId!, pts: 20, def: 10, stops: 5, allowed: 10, exp: 1000 })),
      away: s.rosters.teams[g.away].map(e => ({ playerId: e.playerId!, pts: 18, def: 10, stops: 4, allowed: 12, exp: 1000 })),
    },
  }));
  return { ...s, results: { ...s.results!, games } };
}
const last = (s: SeasonState): RostersFile => ({ ...s.rosters, season: 78 });
const fbaReady = () => withBoxes(regularSeasonDone(fullFbaState(), 3, { awardsOpen: true }));

describe('startAwards', () => {
  it('drafts the race leaders and a suggested All-FBA, writing awards.json only', () => {
    const s = fbaReady();
    const r = ok(startAwards(s, last(s)));
    expect(r.changed).toEqual(['awards']);
    expect(r.label).toBe('Start S79 FBA awards');
    const doc = r.state.awards!;
    expect(AwardsFile.safeParse(doc).success).toBe(true);
    expect(doc.locked).toBe(false);
    const rs = races(s, last(s));
    expect(doc.awards.find(a => a.award === 'MVP')!.playerId).toBe(rs[0].rows[0].playerId);
    expect(doc.awards.some(a => a.award === 'ROTY')).toBe(false);
    expect(doc.allFba!.team1.every(x => x.playerId)).toBe(true);
  });

  it('refuses before the season is over, while a pause is open, off-step, or twice', () => {
    const fresh = fullFbaState();
    expect(startAwards(fresh, null).ok).toBe(false);
    const pause = withBoxes(regularSeasonDone(fresh, 3, { lastPauseOpen: true, awardsOpen: true }));
    const p = startAwards(pause, null);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.problems).toContain('Finish the rating adjustment pause (after game 1290) first');
    const started = ok(startAwards(fbaReady(), null)).state;
    const again = startAwards(started, null);
    expect(again.ok).toBe(false);
  });
});

describe('picking and locking', () => {
  const started = () => {
    const s = fbaReady();
    return { s, st: ok(startAwards(s, last(s))).state };
  };

  it('setAward replaces a pick and setAllFbaSlot changes one slot', () => {
    const { st } = started();
    const d = setAward(st.awards!, 'MVP', 'pX', 'E02');
    expect(d.awards.filter(a => a.award === 'MVP')).toEqual([{ award: 'MVP', playerId: 'pX', teamId: 'E02' }]);
    const d2 = setAllFbaSlot(d, 'team2', 4, 'pY', 'W03');
    expect(d2.allFba!.team2[4]).toEqual({ slot: 'ANY', playerId: 'pY', teamId: 'W03' });
  });

  it('flags missing, ineligible and duplicate picks', () => {
    const { s, st } = started();
    const doc = st.awards!;
    const noDpoy = { ...doc, awards: doc.awards.filter(a => a.award !== 'DPOY') };
    expect(awardProblems(st, last(s), noDpoy)).toContain('Pick a winner for DPOY');
    const mc = races(st, last(s)).find(r => r.award === 'MC')!.rows[0];
    const guardAsMc = races(st, last(s)).find(r => r.award === 'PPK')!.rows[0];
    expect(awardProblems(st, last(s), setAward(doc, 'MC', guardAsMc.playerId, guardAsMc.teamId)).some(p => p.endsWith("isn't eligible for MC Award"))).toBe(true);
    const cSlotGuard = setAllFbaSlot(doc, 'team1', 2, guardAsMc.playerId, guardAsMc.teamId);
    expect(awardProblems(st, last(s), cSlotGuard)).toContain('All-FBA team 1 needs a C in the C slot');
    const twice = setAllFbaSlot(doc, 'team2', 2, doc.allFba!.team1[2].playerId!, doc.allFba!.team1[2].teamId!);
    expect(awardProblems(st, last(s), twice).some(p => p.endsWith('is on both All-FBA teams'))).toBe(true);
    expect(mc.position).toBe('C');
  });

  it('flags a pick for a race with no eligible players, and a pick from the other league', () => {
    const { s, st } = started();
    const doc = st.awards!;
    expect(races(st, last(s)).find(r => r.award === 'ROTY')!.rows).toEqual([]);
    const stray = setAward(doc, 'ROTY', doc.awards[0].playerId, doc.awards[0].teamId);
    expect(awardProblems(st, last(s), stray)).toContain('ROTY has no eligible players; clear the pick');
    const other = { ...doc, awards: [...doc.awards, { award: 'MVP-PL' as const, playerId: doc.awards[0].playerId, teamId: doc.awards[0].teamId }] };
    expect(awardProblems(st, last(s), other).some(p => p.endsWith("isn't an award in this league; clear the pick"))).toBe(true);
  });

  it('locks a complete draft with one awards transaction line, then Lock seeds is allowed', () => {
    const { s, st } = started();
    expect(awardProblems(st, last(s), st.awards!)).toEqual([]);
    const seedsFirst = lockSeeds(st);
    expect(seedsFirst.ok).toBe(false);
    if (!seedsFirst.ok) expect(seedsFirst.problems).toContain('Lock the S79 awards first');
    const r = ok(lockAwards(st, last(s), { batchId: 'b1' }));
    expect(r.changed).toEqual(['awards', 'tx']);
    expect(r.label).toBe('Lock S79 FBA awards');
    expect(r.state.awards!.locked).toBe(true);
    const tx = r.state.tx.entries.at(-1)!;
    expect(tx.type).toBe('awards');
    expect(tx.lines[0]).toMatch(/^S79 FBA awards: MVP /);
    expect(tx.lines.slice(1).map(l => l.split(':')[0])).toEqual(['All-FBA 1st team', 'All-FBA 2nd team']);
    expect(lockSeeds(r.state).ok).toBe(true);
    expect(lockAwards(r.state, last(s), { batchId: 'b2' }).ok).toBe(false);
  });

  it('refuses to lock with problems', () => {
    const { s, st } = started();
    const broken = { ...st, awards: { ...st.awards!, awards: [] } };
    const r = lockAwards(broken, last(s), { batchId: 'b1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toContain('Pick a winner for MVP');
  });
});

describe('D2 awards', () => {
  it('drafts and locks four league MVPs with no All-FBA', () => {
    const s = withBoxes(regularSeasonDone(fullD2State(), 3, { awardsOpen: true }));
    const st = ok(startAwards(s, null)).state;
    expect(st.awards!.awards.map(a => a.award)).toEqual(['MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL']);
    expect(st.awards!.allFba).toBeNull();
    const r = ok(lockAwards(st, null, { batchId: 'b1' }));
    expect(r.state.tx.entries.at(-1)!.lines[0]).toMatch(/^S79 D2 awards: Premier League MVP /);
  });
});
