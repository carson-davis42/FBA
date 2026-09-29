import { describe, expect, it } from 'vitest';
import { RecruitingFile, RostersFile } from '../shared/types';
import {
  addProjection, commit, commitPreview, decommit, fbajcGateProblem, formatShares, projectionShares, removeProjection, uncommitted, unplacedCommits,
} from './recruiting';
import { collegeHole } from './setup';
import { recruitingWrites, type RecruitingResult, type RecruitingState } from './state';
import { collegeClassState, collegeCurrentClassState } from './testFixtures';

const currentClassState = collegeCurrentClassState;
const ctx = { batchId: 'b1' };
const ok = (r: RecruitingResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const project = (s: RecruitingState, id: string, teams: string[]) => teams.reduce((cur, t) => ok(addProjection(cur, id, t)).state, s);

describe('projections', () => {
  it('counts projections per school and shows the shares', () => {
    const s = project(currentClassState(), 'p01914', ['TEX', 'TEX', 'BAY']);
    const zion = s.recruiting.recruits[0];
    expect(zion.projections).toEqual({ TEX: 2, BAY: 1 });
    expect(projectionShares(zion)).toEqual([{ teamId: 'TEX', count: 2, pct: 67 }, { teamId: 'BAY', count: 1, pct: 33 }]);
    expect(formatShares(zion, t => t)).toBe('67% TEX · 33% BAY');
    expect(addProjection(currentClassState(), 'p01914', 'TEX')).toMatchObject({ ok: true, changed: ['recruiting'], label: 'Project Zion Carter to Texas' });
  });

  it('removes one projection at a time and drops a school at zero', () => {
    let s = project(currentClassState(), 'p01914', ['TEX', 'TEX', 'BAY']);
    s = ok(removeProjection(s, 'p01914', 'TEX')).state;
    s = ok(removeProjection(s, 'p01914', 'BAY')).state;
    expect(s.recruiting.recruits[0].projections).toEqual({ TEX: 1 });
    expect(removeProjection(s, 'p01914', 'BAY')).toEqual({ ok: false, problems: ['Zion Carter has no Baylor projection'] });
  });

  it('refuses unknown schools and players, and committed players', () => {
    const s = currentClassState();
    expect(addProjection(s, 'p01914', 'XYZ')).toEqual({ ok: false, problems: ['Unknown school XYZ'] });
    expect(addProjection(s, 'p09999', 'TEX')).toEqual({ ok: false, problems: ["p09999 isn't on the recruiting board"] });
    const committed = ok(commit(s, 'p01914', 'DUKE', ctx)).state;
    expect(addProjection(committed, 'p01914', 'TEX')).toEqual({ ok: false, problems: ['Zion Carter has already committed to Duke'] });
  });
});

describe('commit', () => {
  it('fills an open spot', () => {
    const r = ok(commit(currentClassState(), 'p01914', 'DUKE', ctx));
    expect(r.label).toBe('Zion Carter commits to Duke');
    expect(r.changed).toEqual(['recruiting', 'rosters', 'tx']);
    expect(r.state.rosters.teams.DUKE[0]).toEqual({ playerId: 'p01914', position: 'PG', rating: null, age: null, points: 0, stars: null, classYear: 'Fr' });
    expect(r.state.recruiting.recruits[0].committedTo).toBe('DUKE');
    expect(r.state.recruiting.portal).toEqual([]);
    expect(r.state.tx.entries.at(-1)).toMatchObject({ type: 'commit', teams: ['DUKE'], lines: ['Zion Carter (PG) commits to Duke'] });
    expect(RecruitingFile.safeParse(r.state.recruiting).success).toBe(true);
    expect(RostersFile.safeParse(r.state.rosters).success).toBe(true);
  });

  it('shows the stars once the recruit has them', () => {
    const s = currentClassState();
    const starred = { ...s, recruiting: { ...s.recruiting, recruits: s.recruiting.recruits.map(p => ({ ...p, stars: 5, rating: 88 })) } };
    const r = ok(commit(starred, 'p01914', 'DUKE', ctx));
    expect(r.state.tx.entries.at(-1)!.lines).toEqual(['Zion Carter (5★ PG) commits to Duke']);
    expect(r.state.rosters.teams.DUKE[0]).toMatchObject({ rating: 88, stars: 5 });
  });

  it('sends the returning player at that spot to the transfer portal', () => {
    const r = ok(commit(currentClassState(), 'p01914', 'BAY', ctx));
    expect(r.state.rosters.teams.BAY[0].playerId).toBe('p01914');
    expect(r.state.recruiting.portal).toEqual([
      { playerId: 'p00485', position: 'PG', classYear: 'So', rating: 82, stars: 4, projections: {}, committedTo: null, fromTeam: 'BAY' },
    ]);
    expect(r.state.tx.entries.slice(-2).map(e => [e.type, e.teams, e.lines])).toEqual([
      ['portal', ['BAY'], ['Jaden Moss (So PG, 82) enters the transfer portal from Baylor']],
      ['commit', ['BAY'], ['Zion Carter (PG) commits to Baylor']],
    ]);
    expect(RecruitingFile.safeParse(r.state.recruiting).success).toBe(true);
  });

  it('replaces an unnamed returning player: no portal entry, no portal tx line', () => {
    const r = ok(commit(currentClassState(), 'p01915', 'DUKE', ctx));
    expect(r.state.rosters.teams.DUKE[1]).toMatchObject({ playerId: 'p01915', position: 'SG' });
    expect(r.state.recruiting.portal).toEqual([]);
    expect(r.state.tx.entries.slice(1).map(e => e.type)).toEqual(['commit']);
    expect(r.state.tx.entries.at(-1)!.lines).toEqual(['Malik Ford (SG) commits to Duke']);
  });

  it('refuses to displace a player who committed this cycle (7a-3)', () => {
    const s = ok(commit(currentClassState(), 'p01914', 'BAY', ctx)).state;
    expect(commit(s, 'p00485', 'BAY', ctx)).toEqual({ ok: false, problems: ['Baylor already has Zion Carter committed at PG. Decommit them first'] });
  });

  it('lets a transfer commit to another school', () => {
    let s = ok(commit(currentClassState(), 'p01914', 'BAY', ctx)).state;
    s = ok(commit(s, 'p00485', 'DUKE', ctx)).state;
    expect(s.rosters.teams.DUKE[0]).toEqual({ playerId: 'p00485', position: 'PG', rating: 82, age: null, points: 0, stars: 4, classYear: 'So' });
    expect(s.recruiting.portal[0].committedTo).toBe('DUKE');
    expect(s.tx.entries.at(-1)!.lines).toEqual(['Jaden Moss (So PG, transfer from Baylor) commits to Duke']);
  });

  it('refuses a second commit, an unknown school and a locked board', () => {
    const s = ok(commit(currentClassState(), 'p01914', 'DUKE', ctx)).state;
    expect(commit(s, 'p01914', 'TEX', ctx)).toEqual({ ok: false, problems: ['Zion Carter has already committed to Duke'] });
    expect(commit(currentClassState(), 'p01914', 'XYZ', ctx)).toEqual({ ok: false, problems: ['Unknown school XYZ'] });
    const c = currentClassState();
    expect(commit({ ...c, recruiting: { ...c.recruiting, locked: true } }, 'p01914', 'DUKE', ctx))
      .toEqual({ ok: false, problems: ['Recruiting for this class is finished'] });
  });
});

describe('commitPreview', () => {
  it('says what happens at the chosen school', () => {
    const s = currentClassState();
    expect(commitPreview(s, 'p01914', 'DUKE')).toEqual({ ok: true, text: 'Open spot' });
    expect(commitPreview(s, 'p01914', 'BAY')).toEqual({ ok: true, text: 'Jaden Moss (So, 82) will enter the portal' });
    expect(commitPreview(s, 'p01914', 'XYZ')).toEqual({ ok: false, text: 'Unknown school XYZ' });
    expect(commitPreview(s, 'p01915', 'DUKE')).toEqual({ ok: true, text: 'Replaces an unnamed player' });
    const c = ok(commit(s, 'p01914', 'BAY', ctx)).state;
    expect(commitPreview(c, 'p00485', 'BAY')).toEqual({ ok: false, text: 'Baylor already has Zion Carter committed at PG. Decommit them first' });
  });
});

describe('decommit', () => {
  it('opens the spot, keeps the projections, and leaves a displaced player in the portal', () => {
    let s = project(currentClassState(), 'p01914', ['BAY']);
    s = ok(commit(s, 'p01914', 'BAY', ctx)).state;
    const r = ok(decommit(s, 'p01914', ctx));
    expect(r.label).toBe('Zion Carter decommits from Baylor');
    expect(r.changed).toEqual(['recruiting', 'rosters', 'tx']);
    expect(r.state.rosters.teams.BAY[0]).toEqual(collegeHole('PG'));
    expect(r.state.recruiting.recruits[0]).toMatchObject({ committedTo: null, projections: { BAY: 1 } });
    expect(r.state.recruiting.portal.map(p => p.playerId)).toEqual(['p00485']);
    expect(r.state.tx.entries.at(-1)).toMatchObject({ type: 'commit', teams: ['BAY'], lines: ['Zion Carter decommits from Baylor'] });
  });

  it('refuses a player who has not committed', () => {
    expect(decommit(currentClassState(), 'p01914', ctx)).toEqual({ ok: false, problems: ["Zion Carter hasn't committed"] });
  });
});

describe('uncommitted and the FBAJC gate', () => {
  it('counts recruits and portal players without a commitment', () => {
    expect(fbajcGateProblem(null, null)).toBeNull();
    expect(fbajcGateProblem(currentClassState().recruiting, null)).toBe("3 recruits and 0 portal players haven't committed yet");
    let s = ok(commit(currentClassState(), 'p01914', 'BAY', ctx)).state;
    const open = uncommitted(s.recruiting);
    expect(open.recruits.map(p => p.playerId)).toEqual(['p01915', 'p01916']);
    expect(open.portal.map(p => p.playerId)).toEqual(['p00485']);
    expect(fbajcGateProblem(s.recruiting, null)).toBe("2 recruits and 1 portal player haven't committed yet");
    for (const [id, t] of [['p00485', 'DUKE'], ['p01915', 'BAY'], ['p01916', 'DUKE']] as const) s = ok(commit(s, id, t, ctx)).state;
    expect(fbajcGateProblem(s.recruiting, null)).toBeNull();
  });
});

describe('the FBAJC gate and open roster spots', () => {
  const holes = (n: number): RostersFile => ({
    league: 'fbajc', season: 79, locked: false,
    teams: {
      DUKE: Array.from({ length: n }, () => collegeHole('PG')),
      BAY: [{ playerId: 'p00485', position: 'PG', rating: 82, age: null, points: 0, stars: 4, classYear: 'So' }],
    },
  });
  it('adds the open walk-on spots', () => {
    const board = currentClassState().recruiting;
    expect(fbajcGateProblem(board, holes(2))).toBe("3 recruits and 0 portal players haven't committed yet; 2 open spots need walk-ons");
    expect(fbajcGateProblem(board, holes(1))).toBe("3 recruits and 0 portal players haven't committed yet; 1 open spot needs a walk-on");
    expect(fbajcGateProblem(null, holes(2))).toBe('2 open spots need walk-ons');
    expect(fbajcGateProblem(board, null)).toBe("3 recruits and 0 portal players haven't committed yet");
    expect(fbajcGateProblem(null, holes(0))).toBeNull();
  });
});

describe('next-class commits (the class plays next season)', () => {
  it('commits onto the board and tx only, leaving the rosters alone', () => {
    const s = collegeClassState();
    expect(s.recruiting.classOf).toBe(80);
    const r = ok(commit(s, 'p01914', 'DUKE', ctx));
    expect(r.changed).toEqual(['recruiting', 'tx']);
    expect(r.state.rosters).toBe(s.rosters);
    expect(r.state.recruiting.recruits[0].committedTo).toBe('DUKE');
    expect(r.state.recruiting.portal).toEqual([]);
    expect(r.state.tx.entries.at(-1)).toMatchObject({ type: 'commit', teams: ['DUKE'], lines: ['Zion Carter (PG) commits to Duke'] });
    const stars = { ...s, recruiting: { ...s.recruiting, recruits: s.recruiting.recruits.map(p => ({ ...p, stars: 5, rating: 88 })) } };
    expect(ok(commit(stars, 'p01914', 'DUKE', ctx)).state.tx.entries.at(-1)!.lines).toEqual(['Zion Carter (5★ PG) commits to Duke']);
  });

  it('does not displace anyone, even a named player at that spot', () => {
    const r = ok(commit(collegeClassState(), 'p01914', 'BAY', ctx));
    expect(r.state.recruiting.portal).toEqual([]);
    expect(r.state.tx.entries.slice(1).map(e => e.type)).toEqual(['commit']);
  });

  it('refuses a second recruit at the same school and position', () => {
    const s = collegeClassState();
    const two = { ...s, recruiting: { ...s.recruiting, recruits: s.recruiting.recruits.map(p => (p.playerId === 'p01915' ? { ...p, position: 'PG' as const } : p)) } };
    const first = ok(commit(two, 'p01914', 'DUKE', ctx)).state;
    const why = 'Duke already has Zion Carter committed at PG for the S80 class. Decommit them first';
    expect(commit(first, 'p01915', 'DUKE', ctx)).toEqual({ ok: false, problems: [why] });
    expect(commitPreview(first, 'p01915', 'DUKE')).toEqual({ ok: false, text: why });
    expect(ok(commit(first, 'p01915', 'TEX', ctx)).state.recruiting.recruits[1].committedTo).toBe('TEX');
  });

  it('previews the joining roster', () => {
    expect(commitPreview(collegeClassState(), 'p01914', 'BAY')).toEqual({ ok: true, text: 'Joins the S80 roster at Adjust Age' });
    expect(commitPreview(collegeClassState(), 'p01914', 'XYZ')).toEqual({ ok: false, text: 'Unknown school XYZ' });
  });

  it('decommits from the board and tx only', () => {
    const s = collegeClassState();
    const committed = ok(commit(s, 'p01914', 'DUKE', ctx)).state;
    const r = ok(decommit(committed, 'p01914', ctx));
    expect(r.changed).toEqual(['recruiting', 'tx']);
    expect(r.state.rosters).toBe(s.rosters);
    expect(r.state.recruiting.recruits[0].committedTo).toBeNull();
    expect(r.state.tx.entries.at(-1)!.lines).toEqual(['Zion Carter decommits from Duke']);
  });

  it('writes the board to its own season and the tx to the calendar season', () => {
    const r = ok(commit(collegeClassState(), 'p01914', 'DUKE', ctx));
    expect(recruitingWrites(r).map(w => w.path)).toEqual(['leagues/fbajc/S79/recruiting.json', 'leagues/fbajc/S79/transactions.json']);
  });
});

describe('current-class commits', () => {
  it('places the recruit on the season roster', () => {
    const s = currentClassState();
    expect(s.recruiting.classOf).toBe(s.season);
    const r = ok(commit(s, 'p01914', 'DUKE', ctx));
    expect(r.changed).toEqual(['recruiting', 'rosters', 'tx']);
    expect(r.state.rosters.teams.DUKE[0].playerId).toBe('p01914');
    expect(recruitingWrites(r).map(w => w.path)).toEqual([
      'leagues/fbajc/S78/recruiting.json', 'leagues/fbajc/S79/rosters.json', 'leagues/fbajc/S79/transactions.json',
    ]);
  });
});

describe('unplacedCommits', () => {
  it('lists committed board players who are not on their school roster', () => {
    const s = ok(commit(currentClassState(), 'p01914', 'BAY', ctx)).state;
    expect(unplacedCommits(s.recruiting, s.rosters)).toEqual([]);
    const off = { ...s.rosters, teams: { ...s.rosters.teams, BAY: s.rosters.teams.BAY.map(x => (x.playerId === 'p01914' ? collegeHole('PG') : x)) } };
    expect(unplacedCommits(s.recruiting, off)).toEqual(['p01914']);
  });

  it('ignores uncommitted players', () => {
    const s = currentClassState();
    expect(unplacedCommits(s.recruiting, s.rosters)).toEqual([]);
  });

  it('feeds the FBAJC gate between the uncommitted and open-spot parts', () => {
    const named = (id: string, position: 'PG' | 'SG' | 'SF' | 'PF' | 'C') => ({ playerId: id, position, rating: 70, age: null, points: 0, stars: null, classYear: 'So' as const });
    const full = (open = false): RostersFile => ({
      league: 'fbajc', season: 79, locked: false,
      teams: { BAY: [open ? collegeHole('PG') : named('p00001', 'PG'), named('p00002', 'SG'), named('p00003', 'SF'), named('p00004', 'PF'), named('p00005', 'C')] },
    });
    const base = currentClassState().recruiting;
    const [a, b, c] = base.recruits;
    const board = (recruits: typeof base.recruits) => ({ ...base, recruits, portal: [] });
    expect(fbajcGateProblem(board([{ ...a, committedTo: 'BAY' }]), full())).toBe("1 committed player isn't on the rosters yet");
    expect(fbajcGateProblem(board([{ ...a, committedTo: 'BAY' }, { ...b, committedTo: 'BAY' }]), full())).toBe("2 committed players aren't on the rosters yet");
    expect(fbajcGateProblem(board([{ ...a, committedTo: 'BAY' }, { ...b, committedTo: 'BAY' }, c]), full(true))).toBe(
      "1 recruit and 0 portal players haven't committed yet; 2 committed players aren't on the rosters yet; 1 open spot needs a walk-on",
    );
    expect(fbajcGateProblem(board([]), full())).toBeNull();
  });
});
