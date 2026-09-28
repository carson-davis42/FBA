import { describe, expect, it } from 'vitest';
import { standings } from '../season/standings';
import type { SeasonResult, SeasonState } from '../season/state';
import type { GameResult } from '../shared/types';
import { lockSeeds } from './moves';
import { fullD2State, fullFbaState, playPlayoffs, regularSeasonDone } from './testFixtures';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const teamsOf = (s: SeasonState) => s.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
/** Every game won by the team whose id sorts first, so each league's order is PL01, PL02, … */
function byIdResults(s: SeasonState, count: number): GameResult[] {
  return s.schedule!.games.slice(0, count).map(g => {
    const homeWins = g.home < g.away;
    return { gameNo: g.gameNo, home: g.home, away: g.away, homePts: homeWins ? 80 : 70, awayPts: homeWins ? 70 : 80 };
  });
}
const row = (st: ReturnType<typeof standings>, group: string, teamId: string) => st.groups.find(g => g.group === group)!.rows.find(r => r.teamId === teamId)!;

describe('D2 markers', () => {
  it('shows nothing confirmed early, then *, x, n, ▲ for #1 below PL, and ▼ for the bottom two above IL', () => {
    const s = fullD2State();
    const early = standings('fbad2', teamsOf(s), byIdResults(s, 40));
    expect(early.groups.flatMap(g => g.rows).some(r => r.status !== null)).toBe(false);

    const end = standings('fbad2', teamsOf(s), byIdResults(s, s.schedule!.games.length));
    expect(row(end, 'WL', 'WL01')).toMatchObject({ marker: '*', status: '▲' });
    expect(row(end, 'PL', 'PL01')).toMatchObject({ marker: '*', status: null });
    expect(row(end, 'WL', 'WL08').marker).toBe('x');
    expect(row(end, 'WL', 'WL09').marker).toBe('n');
    for (const g of ['PL', 'WL', 'UL']) {
      expect(row(end, g, `${g}15`).status).toBe('▼');
      expect(row(end, g, `${g}16`).status).toBe('▼');
      expect(row(end, g, `${g}14`).status).toBe(null);
    }
    expect(row(end, 'IL', 'IL16').status).toBe(null);
  });

  it('adds the playoff champion as the second ▲ and a 🏆, or #2 when #1 won', () => {
    const s = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6);
    const pf = s.playoffs!;
    const st = standings('fbad2', teamsOf(s), s.results!.games, undefined, pf);
    for (const g of ['WL', 'UL', 'IL']) {
      const rows = st.groups.find(x => x.group === g)!.rows;
      expect(rows.filter(r => r.status === '▲')).toHaveLength(2);
      expect(rows.filter(r => r.badge === '🏆').map(r => r.teamId)).toEqual([pf.series.find(x => x.id === `${g}-F`)!.winner]);
    }
    const wlRows = st.groups.find(x => x.group === 'WL')!.rows;
    const firstWon = { ...pf, series: pf.series.map(x => (x.id === 'WL-F' ? { ...x, winner: wlRows[0].teamId } : x)) };
    const st2 = standings('fbad2', teamsOf(s), s.results!.games, undefined, firstWon);
    const rows2 = st2.groups.find(x => x.group === 'WL')!.rows;
    expect(rows2.filter(r => r.status === '▲').map(r => r.teamId)).toEqual([rows2[0].teamId, rows2[1].teamId]);
  });
});

describe('FBA badges', () => {
  it('marks the conference champions C and the FBA champion 🏆', () => {
    const s = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullFbaState()))).state, 5);
    const pf = s.playoffs!;
    const st = standings('fba', teamsOf(s), s.results!.games, undefined, pf);
    const all = st.groups.flatMap(g => g.rows);
    const champ = pf.series.find(x => x.id === 'FINALS')!.winner;
    expect(all.filter(r => r.badge === '🏆').map(r => r.teamId)).toEqual([champ]);
    const confChamps = ['E-CF', 'W-CF'].map(id => pf.series.find(x => x.id === id)!.winner).filter(t => t !== champ);
    expect(all.filter(r => r.badge === 'C').map(r => r.teamId)).toEqual(confChamps);
    expect(all.every(r => r.status === null)).toBe(true);
  });
});
