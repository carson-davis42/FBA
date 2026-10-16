import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { applyDivisions } from '../../importers/divisions';
import { lotteryOdds } from '../offseason/lottery';
import { lockSeeds } from '../playoffs/moves';
import { fullDivisionState, playPlayoffs, regularSeasonDone } from '../playoffs/testFixtures';
import { DIVISION_LAYOUT } from '../shared/divisions';
import { teamsInSeason } from '../shared/teams';
import type { TeamsFile } from '../shared/types';
import { buildSchedule } from './schedule';
import { seasonLength, standings } from './standings';

describe('a 32-team S80 with divisions', () => {
  const done = regularSeasonDone(fullDivisionState());

  it('plays 84 games per team, qualifies 8 per conference, plays to one champion and leaves a 16-team lottery', () => {
    const counts = new Map<string, number>();
    for (const g of done.schedule!.games) for (const t of [g.home, g.away]) counts.set(t, (counts.get(t) ?? 0) + 1);
    expect([...counts.values()].every(n => n === 84)).toBe(true);
    expect(done.schedule!.pauses.map(p => p.afterGame)).toEqual([336, 672, 672, 1008, 1008, 1344]);

    const locked = lockSeeds(done);
    if (!locked.ok) throw new Error(locked.problems.join('; '));
    expect(locked.state.playoffs!.seeds.every(s => s.teams.length === 8 && s.wildCards!.length === 2)).toBe(true);
    const finished = playPlayoffs(locked.state);
    expect(finished.playoffs!.outcome!.champions).toHaveLength(1);

    const info = done.teams.teams.map(t => ({ teamId: t.teamId, group: t.group, division: t.division }));
    const st = standings('fba', info, done.results!.games, seasonLength('fba', info), null);
    expect(st.lottery).toHaveLength(16);
    const odds = lotteryOdds(st.lottery.map(r => ({ teamId: r.teamId, w: r.w, l: r.l })));
    if (!odds.ok) throw new Error(odds.problem);
    expect(odds.odds.reduce((s, o) => s + o.pct, 0)).toBeCloseTo(100, 9);
  });

  it('S79 with the same teams file keeps the old shape: 30 teams, 86 games, two conferences', () => {
    const badge = { bg: '#000', fg: '#fff' };
    const old: TeamsFile = {
      league: 'fba',
      teams: DIVISION_LAYOUT.flatMap(d => d.teams.map(teamId => ({
        teamId, name: teamId, abbr: teamId, group: teamId === 'ATL' ? 'E' : teamId === 'STL' ? 'W' : d.group, logoFolder: null, badge,
        ...(teamId === 'PHI' || teamId === 'LAL' ? { fromSeason: 80 } : {}),
      }))),
    };
    const s79 = teamsInSeason(applyDivisions(old), 79).teams;
    expect(s79).toHaveLength(30);
    expect(s79.every(t => t.division === undefined)).toBe(true);
    expect(s79.find(t => t.teamId === 'STL')!.group).toBe('W');
    expect(s79.find(t => t.teamId === 'ATL')!.group).toBe('E');
    const info = s79.map(t => ({ teamId: t.teamId, group: t.group, division: t.division }));
    expect(seasonLength('fba', info)).toEqual({ games: 86, confGames: 56 });
    expect(buildSchedule('fba', info, mulberry32(2))).toHaveLength(1290);
    const s80 = teamsInSeason(applyDivisions(old), 80).teams;
    expect(s80.find(t => t.teamId === 'STL')).toMatchObject({ group: 'E', division: 'GL' });
  });
});
