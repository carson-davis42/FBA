import { describe, expect, it } from 'vitest';
import type { SeasonState } from '../../engine/season/state';
import type { CalendarFile, SummaryFile } from '../../engine/shared/types';
import { tickerItems } from './tickerItems';

const cal: CalendarFile = { season: 80, steps: [
  { id: 'a', label: 'Free agency', kind: 'offseason', league: null, sub: false, done: true },
  { id: 'retirement', label: 'Retirement', kind: 'offseason', league: null, sub: false, done: false },
] };
const players = { players: { p1: { name: 'Ann Lee' }, p2: { name: 'Bo Diaz' } } };
const base = { league: 'fba', season: 79, players, schedule: null, results: null, playoffs: null, awards: null, summary: null } as unknown as SeasonState;
const st = (over: Partial<Record<keyof SeasonState, unknown>>) => ({ ...base, ...over }) as SeasonState;

describe('tickerItems', () => {
  it('shows the latest game day finals in the regular season', () => {
    const state = st({
      schedule: { games: [{ gameNo: 1, home: 'A', away: 'B' }, { gameNo: 2, home: 'C', away: 'D' }, { gameNo: 3, home: 'A', away: 'C' }], pauses: [] },
      results: { games: [
        { gameNo: 1, home: 'A', away: 'B', homePts: 100, awayPts: 90 },
        { gameNo: 2, home: 'C', away: 'D', homePts: 88, awayPts: 95, ot: 1 },
      ] },
    });
    const t = tickerItems({ league: 'fba', label: 'FBA', state, calendar: cal });
    expect(t.label).toBe('FBA · Game Day 1');
    expect(t.items).toHaveLength(2);
    expect(t.items[1]).toEqual({ kind: 'score', key: 'g2', to: '/league/fba/game/2',
      away: { teamId: 'D', value: '95', won: true }, home: { teamId: 'C', value: '88', won: false }, note: 'Final/OT' });
  });

  it('shows the latest round of series in the playoffs', () => {
    const series = (id: string, round: number, hw: number, aw: number, winner: string | null) =>
      ({ id, group: 'E', round, home: `${id}h`, away: `${id}a`, homeSeed: 1, awaySeed: 8, homeWins: hw, awayWins: aw, winner, next: null });
    const state = st({ playoffs: { series: [series('R1', 1, 4, 1, 'R1h'), series('SF', 2, 2, 1, null), series('CF', 3, 0, 0, null)], games: [{}], outcome: null } });
    const t = tickerItems({ league: 'fba', label: 'FBA', state, calendar: cal });
    expect(t.label).toBe('FBA · Playoffs');
    expect(t.items).toEqual([{ kind: 'score', key: 'SF', to: '/league/fba/playoffs',
      away: { teamId: 'SFa', value: '1', won: false }, home: { teamId: 'SFh', value: '2', won: false }, note: 'Series' }]);
  });

  it('shows champions, the Finals MVP, locked awards and the next step once the playoffs are over', () => {
    const state = st({
      playoffs: { series: [], games: [{}], outcome: { champions: [{ group: null, teamId: 'A', runnerUp: 'B', score: '4–2', finalsMvp: 'p1' }], promotion: null } },
      awards: { locked: true, awards: [{ award: 'MVP', playerId: 'p2', teamId: 'C' }] },
    });
    const t = tickerItems({ league: 'fba', label: 'FBA', state, calendar: cal });
    expect(t.label).toBe('FBA · S79 final');
    expect(t.items.map(i => (i.kind === 'text' ? [i.badge, i.text, i.teamId] : null))).toEqual([
      ['Champion', '4–2 over B', 'A'], ['Finals MVP', 'Ann Lee', 'A'], ['MVP', 'Bo Diaz', 'C'], ['Next', 'Retirement', null],
    ]);
    const next = t.items[3];
    expect(next.kind === 'text' && next.to).toBe('/retirement');
  });

  it("uses last season's summary before any game of the new season", () => {
    const lastSummary = { season: 79, champions: [{ title: 'FBA Champion', champion: 'Atlanta Venom', runnerUp: 'Boston Bucks', score: '4–1', teamId: 'ATL' }], awards: [{ award: 'MVP', playerId: 'p1', teamId: 'ATL' }] } as unknown as SummaryFile;
    const t = tickerItems({ league: 'fba', label: 'FBA', state: st({ season: 80 }), lastSummary, calendar: cal });
    expect(t.label).toBe('FBA · S79 final');
    expect(t.items.map(i => (i.kind === 'text' ? i.text : ''))).toEqual(['Atlanta Venom, 4–1 over Boston Bucks', 'Ann Lee', 'Retirement']);
  });

  it('shows only the next step (or an empty chip) without a season state', () => {
    expect(tickerItems({ league: 'fbajc', label: 'JC', calendar: cal }).items.map(i => i.kind === 'text' && i.text)).toEqual(['Retirement']);
    expect(tickerItems({ league: 'fbajc', label: 'JC' }).items.map(i => i.kind === 'text' && i.text)).toEqual(['No results yet']);
  });
});
