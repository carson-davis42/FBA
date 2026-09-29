import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import type { RosterEntry, RostersFile, TeamsFile } from '../shared/types';
import { collegeCurrentClassState, collegePlayers } from './testFixtures';
import type { RecruitingState } from './state';
import { fillWalkOns, openSpots, walkOnBase, walkOnProblem } from './walkOns';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
const player = (id: string, position: RosterEntry['position']): RosterEntry =>
  ({ playerId: id, position, rating: 70, age: null, points: 0, stars: null, classYear: 'So' });
const hole = (position: RosterEntry['position']): RosterEntry =>
  ({ playerId: null, position, rating: null, age: null, points: 0, stars: null, classYear: null });

const teams: TeamsFile = {
  league: 'fbajc',
  teams: [
    { teamId: 'BAY', name: 'Baylor', abbr: 'BAY', group: 'B12', logoFolder: null, badge },
    { teamId: 'MEM', name: 'Memphis', abbr: 'MEM', group: 'AAC', logoFolder: null, badge },
    { teamId: 'PAT', name: 'Patriot', abbr: 'PAT', group: null, logoFolder: null, badge },
  ],
};

/** BAY has a hole at PG, MEM at SG, PAT at C; everything else is a named player. */
function fixture(over: Partial<RecruitingState> = {}): RecruitingState {
  const base = collegeCurrentClassState();
  const rosters: RostersFile = {
    league: 'fbajc', season: 79, locked: false,
    teams: {
      BAY: [hole('PG'), player('p00001', 'SG'), player('p00002', 'SF'), player('p00003', 'PF'), player('p00004', 'C')],
      MEM: [player('p00005', 'PG'), hole('SG'), player('p00006', 'SF'), player('p00007', 'PF'), player('p00008', 'C')],
      PAT: [player('p00009', 'PG'), player('p00010', 'SG'), player('p00011', 'SF'), player('p00012', 'PF'), hole('C')],
    },
  };
  return {
    ...base,
    teams,
    rosters,
    players: collegePlayers(),
    tx: { league: 'fbajc', season: 79, entries: [] },
    // Every recruit has committed, and the FBAJC step is current.
    recruiting: { ...base.recruiting, recruits: [], portal: [] },
    calendar: { season: 79, steps: [{ id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: false }] },
    ...over,
  };
}

describe('walkOnBase', () => {
  it('follows Team.java by conference', () => {
    expect(walkOnBase('B12')).toBe(60);
    expect(walkOnBase('AAC')).toBe(58);
    expect(walkOnBase('MWC')).toBe(58);
    expect(walkOnBase(null)).toBe(55);
    expect(walkOnBase('PAT')).toBe(55);
  });
});

describe('openSpots', () => {
  it('counts the holes on every roster', () => {
    expect(openSpots(fixture().rosters)).toBe(3);
  });
});

describe('walkOnProblem', () => {
  it('needs the FBAJC step', () => {
    const s = fixture();
    const calendar = { season: 79, steps: [
      { id: 'make-s79-schedules', label: 'Make S79 Schedules', kind: 'offseason' as const, league: null, sub: false, done: false },
      ...s.calendar.steps,
    ] };
    expect(walkOnProblem({ ...s, calendar })).toBe('Walk-ons are filled at the FBAJC step (current step: Make S79 Schedules)');
  });

  it('waits for every recruit and portal player to commit', () => {
    const s = fixture();
    const board = collegeCurrentClassState().recruiting;
    expect(walkOnProblem({ ...s, recruiting: board })).toBe("3 recruits and 0 portal players haven't committed yet");
  });

  it('refuses while a committed player is not on the rosters', () => {
    const s = fixture();
    const [r] = collegeCurrentClassState().recruiting.recruits;
    const recruiting = { ...s.recruiting, recruits: [{ ...r, committedTo: 'BAY' }] };
    expect(walkOnProblem({ ...s, recruiting })).toBe("1 committed player isn't on the rosters yet");
  });

  it("refuses on the next class's board", () => {
    const s = fixture();
    expect(walkOnProblem({ ...s, recruiting: { ...s.recruiting, season: 79, classOf: 80 } })).toBe("Walk-ons fill this season's rosters");
  });

  it('needs an open spot', () => {
    const s = fixture();
    const full = Object.fromEntries(Object.entries(s.rosters.teams).map(([id, es]) =>
      [id, es.map(e => (e.playerId === null ? player('p09999', e.position) : e))]));
    expect(walkOnProblem({ ...s, rosters: { ...s.rosters, teams: full } })).toBe('There are no open spots');
  });

  it('is null when walk-ons can be filled', () => {
    expect(walkOnProblem(fixture())).toBeNull();
  });
});

describe('fillWalkOns', () => {
  const run = () => fillWalkOns(fixture(), mulberry32(3), { batchId: 'b1' });

  it('puts a new unnamed player in every hole', () => {
    const r = run();
    if (!r.ok) throw new Error(r.problems.join('; '));
    const [bay, mem, pat] = [r.state.rosters.teams.BAY[0], r.state.rosters.teams.MEM[1], r.state.rosters.teams.PAT[4]];
    expect([bay.playerId, mem.playerId, pat.playerId]).toEqual(['p01914', 'p01915', 'p01916']);
    expect(r.state.players.nextId).toBe(1917);
    for (const id of ['p01914', 'p01915', 'p01916']) expect(r.state.players.players[id]).toEqual({ id, name: null, birthSeason: 61 });
    for (const e of [bay, mem, pat]) expect(e).toMatchObject({ classYear: 'Fr', stars: null, points: 0, age: null });
    expect(bay.rating).toBeGreaterThanOrEqual(60);
    expect(bay.rating).toBeLessThanOrEqual(72);
    expect(mem.rating).toBeGreaterThanOrEqual(58);
    expect(mem.rating).toBeLessThanOrEqual(70);
    expect(pat.rating).toBeGreaterThanOrEqual(55);
    expect(pat.rating).toBeLessThanOrEqual(67);
    expect(openSpots(r.state.rosters)).toBe(0);
  });

  it('is deterministic for the seed', () => {
    expect(run()).toEqual(run());
  });

  it('logs one walk-on entry and reports what changed', () => {
    const r = run();
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(r.state.tx.entries).toHaveLength(1);
    expect(r.state.tx.entries[0]).toMatchObject({ type: 'walk-on', batchId: 'b1', teams: ['BAY', 'MEM', 'PAT'], lines: ['3 walk-ons fill open spots'] });
    expect(r.changed).toEqual(['rosters', 'players', 'tx']);
    expect(r.label).toBe('Fill 3 open spots with walk-ons');
  });

  it('uses the singular for one spot', () => {
    const s = fixture();
    const fill = (id: string) => (es: RosterEntry[]) => es.map(e => (e.playerId === null ? player(id, e.position) : e));
    const rosters = { ...s.rosters, teams: { ...s.rosters.teams, MEM: fill('p09999')(s.rosters.teams.MEM), PAT: fill('p09998')(s.rosters.teams.PAT) } };
    const r = fillWalkOns({ ...s, rosters }, mulberry32(1), { batchId: 'b' });
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(r.label).toBe('Fill 1 open spot with walk-ons');
    expect(r.state.tx.entries[0].lines).toEqual(['1 walk-on fills an open spot']);
  });

  it('refuses with the problem text', () => {
    const s = fixture({ calendar: { season: 79, steps: [{ id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: true }] } });
    const r = fillWalkOns(s, mulberry32(3), { batchId: 'b' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toEqual([walkOnProblem(s)]);
  });

  it('gives a B12 hole exactly the ratings 60 through 72', () => {
    const rng = mulberry32(9);
    const seen = new Set<number>();
    const s = fixture();
    for (let i = 0; i < 2000; i++) {
      const r = fillWalkOns(s, rng, { batchId: 'b' });
      if (!r.ok) throw new Error(r.problems.join('; '));
      seen.add(r.state.rosters.teams.BAY[0].rating!);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]);
  });
});
