import { describe, expect, it } from 'vitest';
import { lockSeeds } from '../playoffs/moves';
import { fullD2State, fullFbaState, playPlayoffs, regularSeasonDone } from '../playoffs/testFixtures';
import type { SeasonResult, SeasonState } from '../season/state';
import { AwardsFile, type RostersFile } from '../shared/types';
import { allFbaProblems, awardProblems, lockAllFba, lockAwards, setAllFbaSlot, setAward, startAllFba, startAwards } from './awardMoves';
import { races, suggestAllFba } from './races';

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
  it('drafts the race leaders with no All-FBA yet, writing awards.json only', () => {
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
    expect(doc.allFba).toBeNull();
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

  it('setAward replaces a pick, and setAllFbaSlot leaves a doc with no All-FBA alone', () => {
    const { st } = started();
    const d = setAward(st.awards!, 'MVP', 'pX', 'E02');
    expect(d.awards.filter(a => a.award === 'MVP')).toEqual([{ award: 'MVP', playerId: 'pX', teamId: 'E02' }]);
    expect(setAllFbaSlot(d, 'team2', 4, 'pY', 'W03')).toBe(d);
  });

  it('flags missing, ineligible and duplicate picks', () => {
    const { s, st } = started();
    const doc = st.awards!;
    const noDpoy = { ...doc, awards: doc.awards.filter(a => a.award !== 'DPOY') };
    expect(awardProblems(st, last(s), noDpoy)).toContain('Pick a winner for DPOY');
    const mc = races(st, last(s)).find(r => r.award === 'MC')!.rows[0];
    const guardAsMc = races(st, last(s)).find(r => r.award === 'PPK')!.rows[0];
    expect(awardProblems(st, last(s), setAward(doc, 'MC', guardAsMc.playerId, guardAsMc.teamId)).some(p => p.endsWith("isn't eligible for MC Award"))).toBe(true);
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
    expect(tx.lines).toHaveLength(1);
    expect(r.state.awards!.allFba).toBeNull();
    expect(r.state.awards!.allFbaLocked).toBe(false);
    expect(AwardsFile.safeParse(r.state.awards).success).toBe(true);
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

describe('lockAwards with an old draft', () => {
  it('discards All-FBA picks drafted before the playoffs', () => {
    const s = fbaReady();
    const st = ok(startAwards(s, last(s))).state;
    const old = {
      ...st,
      awards: { ...st.awards!, allFba: suggestAllFba(races(st, last(s)).find(r => r.award === 'MVP')!) },
    };
    expect(old.awards.allFba!.team1[0].playerId).toBeTruthy();
    const r = ok(lockAwards(old, last(s), { batchId: 'b1' }));
    expect(r.state.awards!.allFba).toBeNull();
    expect(r.state.awards!.allFbaLocked).toBe(false);
  });
});

/** Awards locked, seeds locked and every playoff game played. */
function afterPlayoffs(): SeasonState {
  const s = fbaReady();
  const locked = ok(lockAwards(ok(startAwards(s, last(s))).state, last(s), { batchId: 'a' })).state;
  return playPlayoffs(ok(lockSeeds(locked)).state, 5);
}

describe('startAllFba / lockAllFba', () => {
  const problems = (r: SeasonResult) => (r.ok ? [] : r.problems);

  it('are refused until the awards are locked and the playoffs are finished', () => {
    const s = fbaReady();
    const drafted = ok(startAwards(s, last(s))).state;
    expect(problems(startAllFba(drafted, last(s)))).toEqual(['Lock the S79 awards first', 'Finish the playoffs first']);
    const locked = ok(lockAwards(drafted, last(s), { batchId: 'a' })).state;
    expect(problems(startAllFba(locked, last(s)))).toEqual(['Finish the playoffs first']);
    expect(problems(lockAllFba(locked, last(s), { batchId: 'b' }))).toEqual(['Finish the playoffs first']);
    const partway = playPlayoffs(ok(lockSeeds(locked)).state, 5, 10);
    expect(problems(startAllFba(partway, last(s)))).toEqual(['Finish the playoffs first']);
  });

  it('are refused off the FBA calendar step, for the D2, and once locked', () => {
    const done = afterPlayoffs();
    const off = { ...done, calendar: { ...done.calendar, steps: done.calendar.steps.map(x => (x.id === 'fba' ? { ...x, done: true } : x)) } };
    expect(problems(startAllFba(off, last(done)))[0]).toMatch(/^The season is played at the /);
    const d2 = withBoxes(regularSeasonDone(fullD2State(), 3));
    expect(problems(startAllFba(d2, null))).toEqual(['The D2 has no All-FBA teams']);
    const started = ok(startAllFba(done, last(done))).state;
    const lockedState = ok(lockAllFba(started, last(done), { batchId: 'c' })).state;
    expect(problems(startAllFba(lockedState, last(done)))).toEqual(['The All-FBA teams are already locked']);
    expect(problems(lockAllFba(lockedState, last(done), { batchId: 'd' }))).toEqual(['The All-FBA teams are already locked']);
    // an old doc that locked with the awards counts as locked
    const { allFbaLocked: _unused, ...oldAwards } = done.awards!;
    expect(problems(startAllFba({ ...done, awards: oldAwards }, last(done)))).toEqual(['The All-FBA teams are already locked']);
  });

  it('drafts from the pooled stats, can be re-run, and locks with one transaction of two lines', () => {
    const done = afterPlayoffs();
    const a = ok(startAllFba(done, last(done)));
    expect(a.changed).toEqual(['awards']);
    expect(AwardsFile.safeParse(a.state.awards).success).toBe(true);
    expect(a.state.awards!.locked).toBe(true);
    expect(a.state.awards!.allFbaLocked).toBe(false);
    const mvp = races(done, last(done), { includePlayoffs: true }).find(r => r.award === 'MVP')!;
    expect(a.state.awards!.allFba).toEqual(suggestAllFba(mvp));
    expect(a.state.awards!.allFba!.team1.every(x => x.playerId)).toBe(true);
    expect(ok(startAllFba(a.state, last(done))).state.awards!.allFba).toEqual(a.state.awards!.allFba);

    expect(allFbaProblems(a.state, last(done), a.state.awards!)).toEqual([]);
    const r = ok(lockAllFba(a.state, last(done), { batchId: 'b1' }));
    expect(r.changed).toEqual(['awards', 'tx']);
    expect(r.label).toBe('Lock S79 All-FBA teams');
    expect(r.state.awards!.allFbaLocked).toBe(true);
    expect(AwardsFile.safeParse(r.state.awards).success).toBe(true);
    const tx = r.state.tx.entries.at(-1)!;
    expect(tx.type).toBe('awards');
    expect(tx.lines.map(l => l.split(':')[0])).toEqual(['All-FBA 1st team', 'All-FBA 2nd team']);
  });

  it('refuses to lock before a suggestion and flags bad slots with the same messages as before', () => {
    const done = afterPlayoffs();
    expect(problems(lockAllFba(done, last(done), { batchId: 'b' }))).toEqual(['Fill in the All-FBA teams']);
    const doc = ok(startAllFba(done, last(done))).state.awards!;
    const st = { ...done, awards: doc };
    const guard = races(done, last(done), { includePlayoffs: true }).find(r => r.award === 'PPK')!.rows[0];
    const cSlotGuard = setAllFbaSlot(doc, 'team1', 2, guard.playerId, guard.teamId);
    expect(allFbaProblems(st, last(done), cSlotGuard)).toContain('All-FBA team 1 needs a C in the C slot');
    const twice = setAllFbaSlot(doc, 'team2', 2, doc.allFba!.team1[2].playerId!, doc.allFba!.team1[2].teamId!);
    expect(allFbaProblems(st, last(done), twice).some(p => p.endsWith('is on both All-FBA teams'))).toBe(true);
    expect(problems(lockAllFba({ ...st, awards: cSlotGuard }, last(done), { batchId: 'b' }))).toContain('All-FBA team 1 needs a C in the C slot');
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
