import { describe, expect, it } from 'vitest';
import { powerRankings } from '../playoffs/ranker';
import { fullD2State, fullFbaState, regularSeasonDone } from '../playoffs/testFixtures';
import { movement, rankingAt, rankingMarks } from './rankingsTimeline';

describe('rankingMarks', () => {
  it('marks every 20 FBA games and adds the final game', () => {
    expect(rankingMarks('fba', 45, 1290)).toEqual([20, 40]);
    const all = rankingMarks('fba', 1290, 1290);
    expect(all).toHaveLength(65);
    expect(all.slice(-2)).toEqual([1280, 1290]);
    expect(rankingMarks('fba', 10, 1290)).toEqual([]);
  });
  it('marks every 32 D2 games', () => {
    const all = rankingMarks('fbad2', 960, 960);
    expect(all).toHaveLength(30);
    expect(all.at(-1)).toBe(960);
  });
});

describe('rankingAt', () => {
  const fba = regularSeasonDone(fullFbaState());
  const teams = fba.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
  const games = fba.results!.games;

  it('matches powerRankings over all games at the final mark, with records', () => {
    const rows = rankingAt(teams, games, games.length, null);
    const ranked = rows.filter(r => r.rank !== null).map(r => r.teamId);
    expect(ranked).toEqual(powerRankings(games));
    expect(rows).toHaveLength(30);
    expect(rows[0].w + rows[0].l).toBe(86);
  });

  it('puts teams with no wins yet at the bottom, unranked, by id', () => {
    const rows = rankingAt(teams, games, 2, null);
    const unranked = rows.filter(r => r.rank === null);
    expect(unranked.length).toBeGreaterThan(0);
    expect(rows.slice(-unranked.length)).toEqual(unranked);
    expect(unranked.map(r => r.teamId)).toEqual([...unranked.map(r => r.teamId)].sort());
  });

  it('ranks a D2 league on its own', () => {
    const d2 = regularSeasonDone(fullD2State());
    const t2 = d2.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
    const rows = rankingAt(t2, d2.results!.games, 960, 'WL');
    expect(rows).toHaveLength(16);
    expect(rows.every(r => r.teamId.startsWith('WL'))).toBe(true);
    expect(rows[0].rank).toBe(1);
  });
});

describe('movement', () => {
  it('shows arrows, no change, NEW and unranked', () => {
    expect(movement(5, 2)).toBe('▲3');
    expect(movement(2, 4)).toBe('▼2');
    expect(movement(3, 3)).toBe('—');
    expect(movement(undefined, 1)).toBe('—');
    expect(movement(null, 7)).toBe('NEW');
    expect(movement(4, null)).toBe('');
  });
});
