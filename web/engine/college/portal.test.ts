import { describe, expect, it } from 'vitest';
import type { CalendarFile, PortalPlayer, RosterEntry } from '../shared/types';
import { enterPortal, portalByRating, portalCandidates, portalProblem, takeOutOfPortal } from './portal';
import type { RecruitingResult, RecruitingState } from './state';
import { collegeCurrentClassState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = (r: RecruitingResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const problems = (r: RecruitingResult) => {
  if (r.ok) throw new Error('expected a refusal');
  return r.problems;
};

const stepDone = (cal: CalendarFile, ...ids: string[]): CalendarFile => ({
  ...cal, steps: cal.steps.map(s => (ids.includes(s.id) ? { ...s, done: true } : s)),
});
const e = (playerId: string | null, position: RosterEntry['position'], classYear: RosterEntry['classYear'], rating: number | null, stars: number | null = null): RosterEntry =>
  ({ playerId, position, rating, age: null, points: 0, stars, classYear });

/** S79 with the portal open; Duke: PG Ty Brooks (Jr, 84, 4 stars), SG X (So, 60), SF Sam Hill (So, 80), PF hole, C Cal Fry (Fr, 63). */
function open(): RecruitingState {
  const s = collegeCurrentClassState();
  const players = { ...s.players, players: {
    ...s.players.players,
    p00510: { id: 'p00510', name: 'Ty Brooks', birthSeason: null },
    p00512: { id: 'p00512', name: 'Sam Hill', birthSeason: null },
    p00514: { id: 'p00514', name: 'Cal Fry', birthSeason: null },
  } };
  return {
    ...s,
    players,
    rosters: { ...s.rosters, teams: { ...s.rosters.teams, DUKE: [
      e('p00510', 'PG', 'Jr', 84, 4), e('p00511', 'SG', 'So', 60), e('p00512', 'SF', 'So', 80), e(null, 'PF', null, null), e('p00514', 'C', 'Fr', 63),
    ] } },
    calendar: stepDone(s.calendar, 'make-s79-schedules'),
  };
}

const portalPlayer = (playerId: string, rating: number | null): PortalPlayer =>
  ({ playerId, position: 'PG', classYear: 'Jr', rating, stars: null, projections: {}, committedTo: null, fromTeam: 'DUKE' });

describe('portalProblem', () => {
  it('is open from Make Schedules done until FBAJC is done', () => {
    const cal = collegeCurrentClassState().calendar;
    expect(portalProblem(cal)).toBe('The S79 transfer portal opens when the offseason ends (after Make S79 Schedules)');
    expect(portalProblem(stepDone(cal, 'make-s79-schedules'))).toBeNull();
    expect(portalProblem(stepDone(cal, 'make-s79-schedules', 'fbajc'))).toBe('The S79 transfer portal is closed');
  });
});

describe('portalCandidates', () => {
  it('lists named So/Jr/Sr players, skipping Freshmen, X players, recruits and portal players, by school then position', () => {
    const s = open();
    const rows = portalCandidates(s).map(c => `${c.teamId} ${c.position} ${c.playerId}`);
    expect(rows).toEqual([
      'BAY PG p00485', 'BAY PF p00488', 'DUKE PG p00510', 'DUKE SF p00512', 'TEX PF p00503',
    ]);
    expect(portalCandidates(s)[2]).toEqual({ playerId: 'p00510', teamId: 'DUKE', position: 'PG', classYear: 'Jr', rating: 84 });
    // Already in the portal, or a recruit: skipped.
    const inPortal = { ...s, recruiting: { ...s.recruiting, portal: [portalPlayer('p00510', 84)] } };
    expect(portalCandidates(inPortal).map(c => c.playerId)).not.toContain('p00510');
    const { fromTeam: _from, ...asProspect } = portalPlayer('p00512', 80);
    const asRecruit = { ...s, recruiting: { ...s.recruiting, recruits: [...s.recruiting.recruits, asProspect] } };
    expect(portalCandidates(asRecruit).map(c => c.playerId)).not.toContain('p00512');
  });
});

describe('enterPortal', () => {
  it('opens the spots and adds the players to the portal with a log line each', () => {
    const s = open();
    const r = ok(enterPortal(s, ['p00510', 'p00512'], ctx));
    expect(r.changed).toEqual(['recruiting', 'rosters', 'tx']);
    expect(r.label).toBe('2 players enter the transfer portal');
    expect(r.state.rosters.teams.DUKE[0]).toEqual({ playerId: null, position: 'PG', rating: null, age: null, points: 0, stars: null, classYear: null });
    expect(r.state.rosters.teams.DUKE[2].playerId).toBeNull();
    expect(r.state.rosters.teams.DUKE[1].playerId).toBe('p00511');
    expect(r.state.recruiting.portal).toEqual([
      { playerId: 'p00510', position: 'PG', classYear: 'Jr', rating: 84, stars: 4, projections: {}, committedTo: null, fromTeam: 'DUKE' },
      { playerId: 'p00512', position: 'SF', classYear: 'So', rating: 80, stars: null, projections: {}, committedTo: null, fromTeam: 'DUKE' },
    ]);
    expect('consensus' in r.state.recruiting.portal[0]).toBe(false);
    expect(r.state.tx.entries.filter(t => t.type === 'portal').map(t => [t.type, t.teams, t.lines])).toEqual([
      ['portal', ['DUKE'], ['Ty Brooks (Jr PG, 84) enters the transfer portal from Duke']],
      ['portal', ['DUKE'], ['Sam Hill (So SF, 80) enters the transfer portal from Duke']],
    ]);
  });

  it('labels one player in the singular', () => {
    expect(ok(enterPortal(open(), ['p00510'], ctx)).label).toBe('1 player enters the transfer portal');
  });

  it('refuses when closed, for non-candidates, an empty list, and a next-class board', () => {
    const s = open();
    const closed = { ...s, calendar: stepDone(s.calendar, 'fbajc') };
    expect(problems(enterPortal(closed, ['p00510'], ctx))).toEqual(['The S79 transfer portal is closed']);
    expect(problems(enterPortal(s, ['p00510', 'p00511'], ctx))).toEqual(["X can't enter the portal"]);
    expect(problems(enterPortal(s, ['p00514'], ctx))).toEqual(["Cal Fry can't enter the portal"]);
    expect(problems(enterPortal(s, [], ctx))).toEqual(['Pick at least one player']);
    const next = { ...s, recruiting: { ...s.recruiting, season: 79, classOf: 80 } };
    expect(problems(enterPortal(next, ['p00510'], ctx))).toEqual(['The portal belongs to the S79 class board']);
  });
});

describe('takeOutOfPortal', () => {
  const entered = () => ok(enterPortal(open(), ['p00510'], ctx)).state;

  it('puts an uncommitted player back in their old spot', () => {
    const r = ok(takeOutOfPortal(entered(), 'p00510', ctx));
    expect(r.changed).toEqual(['recruiting', 'rosters', 'tx']);
    expect(r.label).toBe('Ty Brooks leaves the transfer portal and stays at Duke');
    expect(r.state.recruiting.portal).toEqual([]);
    expect(r.state.rosters.teams.DUKE[0]).toEqual(e('p00510', 'PG', 'Jr', 84, 4));
    const last = r.state.tx.entries[r.state.tx.entries.length - 1];
    expect([last.type, last.teams, last.lines]).toEqual(['portal', ['DUKE'], ['Ty Brooks leaves the transfer portal and stays at Duke']]);
  });

  it('refuses a committed player, a filled spot, and someone not in the portal', () => {
    const s = entered();
    const committed = { ...s, recruiting: { ...s.recruiting, portal: s.recruiting.portal.map(p => ({ ...p, committedTo: 'BAY' })) } };
    expect(problems(takeOutOfPortal(committed, 'p00510', ctx))).toEqual(['Decommit Ty Brooks first']);
    const filled = { ...s, rosters: { ...s.rosters, teams: { ...s.rosters.teams, DUKE: s.rosters.teams.DUKE.map((x, i) => (i === 0 ? e('p00500', 'PG', 'Fr', 70) : x)) } } };
    expect(problems(takeOutOfPortal(filled, 'p00510', ctx))).toEqual(["Ty Brooks's spot at Duke has been filled"]);
    expect(problems(takeOutOfPortal(s, 'p00512', ctx))).toEqual(["p00512 isn't in the transfer portal"]);
  });

  it('refuses on a next-class board', () => {
    const s = entered();
    const next = { ...s, recruiting: { ...s.recruiting, season: 79, classOf: 80 } };
    expect(problems(takeOutOfPortal(next, 'p00510', ctx))).toEqual(['The portal belongs to the S79 class board']);
  });
});

describe('portalByRating', () => {
  it('orders highest first, null last, ties by name', () => {
    const s = open();
    const named = (id: string, name: string) => [id, { id, name, birthSeason: null }] as const;
    const players = { ...s.players, players: { ...s.players.players, ...Object.fromEntries([named('pa', 'Zed'), named('pb', 'Abe'), named('pc', 'Mo'), named('pd', 'Bo')]) } };
    const withPortal = { ...s, players, recruiting: { ...s.recruiting, portal: [portalPlayer('pc', null), portalPlayer('pa', 80), portalPlayer('pd', 84), portalPlayer('pb', 80)] } };
    expect(portalByRating(withPortal).map(p => p.playerId)).toEqual(['pd', 'pb', 'pa', 'pc']);
  });
});
