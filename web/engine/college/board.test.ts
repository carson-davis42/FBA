import { describe, expect, it } from 'vitest';
import { RecruitingFile, RostersFile } from '../shared/types';
import {
  addProjection, commit, commitPreview, decommit, fbajcGateProblem, formatShares, projectionShares, removeProjection, uncommitted,
} from './recruiting';
import { collegeHole } from './setup';
import type { RecruitingResult, RecruitingState } from './state';
import { collegeClassState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = (r: RecruitingResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const project = (s: RecruitingState, id: string, teams: string[]) => teams.reduce((cur, t) => ok(addProjection(cur, id, t)).state, s);

describe('projections', () => {
  it('counts projections per school and shows the shares', () => {
    const s = project(collegeClassState(), 'p01914', ['TEX', 'TEX', 'BAY']);
    const zion = s.recruiting.recruits[0];
    expect(zion.projections).toEqual({ TEX: 2, BAY: 1 });
    expect(projectionShares(zion)).toEqual([{ teamId: 'TEX', count: 2, pct: 67 }, { teamId: 'BAY', count: 1, pct: 33 }]);
    expect(formatShares(zion, t => t)).toBe('67% TEX · 33% BAY');
    expect(addProjection(collegeClassState(), 'p01914', 'TEX')).toMatchObject({ ok: true, changed: ['recruiting'], label: 'Project Zion Carter to Texas' });
  });

  it('removes one projection at a time and drops a school at zero', () => {
    let s = project(collegeClassState(), 'p01914', ['TEX', 'TEX', 'BAY']);
    s = ok(removeProjection(s, 'p01914', 'TEX')).state;
    s = ok(removeProjection(s, 'p01914', 'BAY')).state;
    expect(s.recruiting.recruits[0].projections).toEqual({ TEX: 1 });
    expect(removeProjection(s, 'p01914', 'BAY')).toEqual({ ok: false, problems: ['Zion Carter has no Baylor projection'] });
  });

  it('refuses unknown schools and players, and committed players', () => {
    const s = collegeClassState();
    expect(addProjection(s, 'p01914', 'XYZ')).toEqual({ ok: false, problems: ['Unknown school XYZ'] });
    expect(addProjection(s, 'p09999', 'TEX')).toEqual({ ok: false, problems: ["p09999 isn't on the recruiting board"] });
    const committed = ok(commit(s, 'p01914', 'DUKE', ctx)).state;
    expect(addProjection(committed, 'p01914', 'TEX')).toEqual({ ok: false, problems: ['Zion Carter has already committed to Duke'] });
  });
});

describe('commit', () => {
  it('fills an open spot', () => {
    const r = ok(commit(collegeClassState(), 'p01914', 'DUKE', ctx));
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
    const s = collegeClassState();
    const starred = { ...s, recruiting: { ...s.recruiting, recruits: s.recruiting.recruits.map(p => ({ ...p, stars: 5, rating: 88 })) } };
    const r = ok(commit(starred, 'p01914', 'DUKE', ctx));
    expect(r.state.tx.entries.at(-1)!.lines).toEqual(['Zion Carter (5★ PG) commits to Duke']);
    expect(r.state.rosters.teams.DUKE[0]).toMatchObject({ rating: 88, stars: 5 });
  });

  it('sends the returning player at that spot to the transfer portal', () => {
    const r = ok(commit(collegeClassState(), 'p01914', 'BAY', ctx));
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

  it('calls an unnamed returning player X', () => {
    const r = ok(commit(collegeClassState(), 'p01915', 'DUKE', ctx));
    expect(r.state.tx.entries.at(-2)!.lines).toEqual(['X (So SG, 60) enters the transfer portal from Duke']);
  });

  it('refuses to displace a player who committed this cycle (7a-3)', () => {
    const s = ok(commit(collegeClassState(), 'p01914', 'BAY', ctx)).state;
    expect(commit(s, 'p00485', 'BAY', ctx)).toEqual({ ok: false, problems: ['Baylor already has Zion Carter committed at PG. Decommit them first'] });
  });

  it('lets a transfer commit to another school', () => {
    let s = ok(commit(collegeClassState(), 'p01914', 'BAY', ctx)).state;
    s = ok(commit(s, 'p00485', 'DUKE', ctx)).state;
    expect(s.rosters.teams.DUKE[0]).toEqual({ playerId: 'p00485', position: 'PG', rating: 82, age: null, points: 0, stars: 4, classYear: 'So' });
    expect(s.recruiting.portal[0].committedTo).toBe('DUKE');
    expect(s.tx.entries.at(-1)!.lines).toEqual(['Jaden Moss (So PG, transfer from Baylor) commits to Duke']);
  });

  it('refuses a second commit, an unknown school and a locked board', () => {
    const s = ok(commit(collegeClassState(), 'p01914', 'DUKE', ctx)).state;
    expect(commit(s, 'p01914', 'TEX', ctx)).toEqual({ ok: false, problems: ['Zion Carter has already committed to Duke'] });
    expect(commit(collegeClassState(), 'p01914', 'XYZ', ctx)).toEqual({ ok: false, problems: ['Unknown school XYZ'] });
    const c = collegeClassState();
    expect(commit({ ...c, recruiting: { ...c.recruiting, locked: true } }, 'p01914', 'DUKE', ctx))
      .toEqual({ ok: false, problems: ['Recruiting for this class is finished'] });
  });
});

describe('commitPreview', () => {
  it('says what happens at the chosen school', () => {
    const s = collegeClassState();
    expect(commitPreview(s, 'p01914', 'DUKE')).toEqual({ ok: true, text: 'Open spot' });
    expect(commitPreview(s, 'p01914', 'BAY')).toEqual({ ok: true, text: 'Jaden Moss (So, 82) will enter the portal' });
    expect(commitPreview(s, 'p01914', 'XYZ')).toEqual({ ok: false, text: 'Unknown school XYZ' });
    const c = ok(commit(s, 'p01914', 'BAY', ctx)).state;
    expect(commitPreview(c, 'p00485', 'BAY')).toEqual({ ok: false, text: 'Baylor already has Zion Carter committed at PG. Decommit them first' });
  });
});

describe('decommit', () => {
  it('opens the spot, keeps the projections, and leaves a displaced player in the portal', () => {
    let s = project(collegeClassState(), 'p01914', ['BAY']);
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
    expect(decommit(collegeClassState(), 'p01914', ctx)).toEqual({ ok: false, problems: ["Zion Carter hasn't committed"] });
  });
});

describe('uncommitted and the FBAJC gate', () => {
  it('counts recruits and portal players without a commitment', () => {
    expect(fbajcGateProblem(null)).toBeNull();
    expect(fbajcGateProblem(collegeClassState().recruiting)).toBe("3 recruits and 0 portal players haven't committed yet");
    let s = ok(commit(collegeClassState(), 'p01914', 'BAY', ctx)).state;
    const open = uncommitted(s.recruiting);
    expect(open.recruits.map(p => p.playerId)).toEqual(['p01915', 'p01916']);
    expect(open.portal.map(p => p.playerId)).toEqual(['p00485']);
    expect(fbajcGateProblem(s.recruiting)).toBe("2 recruits and 1 portal player haven't committed yet");
    for (const [id, t] of [['p00485', 'DUKE'], ['p01915', 'BAY'], ['p01916', 'DUKE']] as const) s = ok(commit(s, id, t, ctx)).state;
    expect(fbajcGateProblem(s.recruiting)).toBeNull();
  });
});
