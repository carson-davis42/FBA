import { describe, expect, it } from 'vitest';
import {
  d2MvpCounts, d2Mvps, d2PlayerHonours, d2TeamCase, d2TitleRows, leagueInSeason, leaguePath, rsChampionsOf,
} from './d2';
import type { D2DraftHistoryFile, D2LeagueHistoryFile, SummaryFile, Team } from '../shared/types';

const team = (teamId: string, name: string): Team => ({ teamId, name, abbr: teamId, group: 'PL', logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams = [team('OSK', 'Osaka Kings'), team('LIS', 'Lisbon Stars')];
const base = { league: 'fbad2', locked: true, host: null } as const;
const row = (teamId: string, name: string, group: string, rank: number) =>
  ({ teamId, name, group, rank, w: 10, l: 5, confW: null, confL: null, diff: null, marker: null, seed: null, playoff: null });

const s55 = {
  ...base, season: 55,
  champions: [
    { title: 'D2 Champion', champion: 'Old Town', runnerUp: 'Lisbon Stars', score: '4-1', group: 'D2', finalsMvp: 'p00009', runnerUpId: 'LIS' },
    { title: 'D2 Cup', champion: 'Osaka Kings', runnerUp: null, score: null, group: null, teamId: 'OSK' },
  ],
  awards: [
    { award: 'MVP-IL', playerId: 'p00002', teamId: 'Old Town' },
    { award: 'MVP-D2', playerId: 'p00001', teamId: 'OSK' },
    { award: 'MVP-D2', playerId: 'p00001', teamId: 'OSK' },
  ],
  rsChampions: [{ group: 'AM', teams: ['Osaka Kings', 'Old Town'] }],
} as SummaryFile;
const s70 = {
  ...base, season: 70,
  champions: [{ title: 'PL Champion', champion: 'Osaka Kings', runnerUp: 'Lisbon Stars', score: '4-2', group: 'PL', teamId: 'OSK', runnerUpId: 'LIS', finalsMvp: 'p00003' }],
  awards: [{ award: 'MVP-PL', playerId: 'p00003', teamId: 'OSK' }, { award: 'MVP-D2', playerId: 'p00002', teamId: 'Other' }],
} as SummaryFile;
const s80 = {
  ...base, season: 80,
  champions: [],
  standings: [row('LIS', 'Lisbon Stars', 'WL', 1), row('OSK', 'Osaka Kings', 'PL', 1), row('X', 'Xtra', 'UL', 1), row('Y', 'Yt', 'PL', 2)],
} as SummaryFile;

describe('d2TitleRows', () => {
  it('lists newest season first, then champions order, with both S55 titles', () => {
    const rows = d2TitleRows([s55, s80, s70]);
    expect(rows.map(r => [r.season, r.title])).toEqual([[70, 'PL Champion'], [55, 'D2 Champion'], [55, 'D2 Cup']]);
    expect(rows[1]).toEqual({ season: 55, title: 'D2 Champion', group: 'D2', champion: 'Old Town', teamId: null, runnerUp: 'Lisbon Stars', runnerUpId: 'LIS', score: '4-1', seriesMvp: 'p00009' });
    expect(rows[2].group).toBeNull();
    expect(rows[2].seriesMvp).toBeNull();
  });
});

describe('rsChampionsOf', () => {
  it('reads the rsChampions field', () => {
    expect(rsChampionsOf(s55)).toEqual([{ group: 'AM', teams: ['Osaka Kings', 'Old Town'] }]);
  });
  it('falls back to the rank-1 standings rows in PL, WL, UL, IL order', () => {
    expect(rsChampionsOf(s80)).toEqual([{ group: 'PL', teams: ['Osaka Kings'] }, { group: 'WL', teams: ['Lisbon Stars'] }, { group: 'UL', teams: ['Xtra'] }]);
  });
  it('is empty with neither', () => { expect(rsChampionsOf(s70)).toEqual([]); });
});

describe('d2Mvps / d2MvpCounts', () => {
  it('orders by the award list and keeps duplicates', () => {
    expect(d2Mvps(s55).map(a => a.award)).toEqual(['MVP-D2', 'MVP-D2', 'MVP-IL']);
  });
  it('counts the S55 duplicate twice, desc by count then id', () => {
    expect(d2MvpCounts([s55, s70])).toEqual([
      { playerId: 'p00001', count: 2 }, { playerId: 'p00002', count: 2 }, { playerId: 'p00003', count: 1 },
    ]);
  });
});

const history: D2LeagueHistoryFile = {
  teams: [
    { teamId: 'OSK', founded: 60, spells: [{ group: 'PL', from: 68, to: 71 }, { group: 'WL', from: 71, to: 73 }, { group: 'PL', from: 74, to: null }] },
    { teamId: 'LIS', founded: 60, spells: [{ group: 'PL', from: 68, to: 70 }, { group: 'PL', from: 71, to: 75 }] },
    { teamId: 'NEW', founded: 70, spells: [{ group: 'PL', from: 70, to: null }] },
  ],
};

describe('leagueInSeason', () => {
  it('takes the last spell covering a shared edge', () => {
    expect(leagueInSeason(history, 'OSK', 70)).toBe('PL');
    expect(leagueInSeason(history, 'OSK', 71)).toBe('WL');
    expect(leagueInSeason(history, 'OSK', 73)).toBe('WL');
    expect(leagueInSeason(history, 'OSK', 74)).toBe('PL');
    expect(leagueInSeason(history, 'OSK', 90)).toBe('PL');
    expect(leagueInSeason(history, 'OSK', 10)).toBeNull();
    expect(leagueInSeason(history, 'ZZZ', 70)).toBeNull();
    expect(leagueInSeason(null, 'OSK', 70)).toBeNull();
  });
});

describe('leaguePath', () => {
  it('returns imported spells, leaving the open one null', () => {
    expect(leaguePath(history, [s70], 'NEW')).toEqual([{ group: 'PL', from: 70, to: null }]);
  });
  it('is empty with no imported entry and no app seasons', () => {
    expect(leaguePath(history, [s80], 'Q')).toEqual([]);
    expect(leaguePath(null, [], 'OSK')).toEqual([]);
  });
  it('closes the open spell at S79 and appends app seasons', () => {
    const h: D2LeagueHistoryFile = { teams: [{ teamId: 'LIS', founded: 60, spells: [{ group: 'PL', from: 75, to: null }] }] };
    expect(leaguePath(h, [s80], 'LIS')).toEqual([{ group: 'PL', from: 75, to: 79 }, { group: 'WL', from: 80, to: null }]);
  });
  it('merges the current season into the same group', () => {
    const h: D2LeagueHistoryFile = { teams: [{ teamId: 'LIS', founded: 60, spells: [{ group: 'PL', from: 75, to: null }] }] };
    expect(leaguePath(h, [], 'LIS', { season: 80, group: 'PL' })).toEqual([{ group: 'PL', from: 75, to: null }]);
    expect(leaguePath(h, [], 'LIS', { season: 80, group: 'IL' })).toEqual([{ group: 'PL', from: 75, to: 79 }, { group: 'IL', from: 80, to: null }]);
  });
  it('merges adjacent same-group spells', () => {
    expect(leaguePath(history, [], 'LIS')).toEqual([{ group: 'PL', from: 68, to: 75 }]);
  });
});

describe('d2TeamCase', () => {
  const drafts: D2DraftHistoryFile = { drafts: [{ season: 70, picks: [
    { pick: 1, teamId: 'OSK', teamName: 'Osaka Kings', name: 'A Guy', playerId: 'p00003', pos: 'PG', age: 19, rating: null },
    { pick: 2, teamId: null, teamName: 'Osaka Kings', name: 'B Guy', playerId: null, pos: 'C', age: null, rating: null },
    { pick: 3, teamId: 'LIS', teamName: 'Lisbon Stars', name: 'C Guy', playerId: null, pos: 'C', age: null, rating: null },
  ] }] };
  it('collects titles, finals lost, regular-season titles, MVPs, series MVPs and picks', () => {
    const c = d2TeamCase(teams[0], [s55, s70, s80], drafts);
    expect(c.titles).toEqual([{ season: 55, title: 'D2 Cup', group: null }, { season: 70, title: 'PL Champion', group: 'PL' }]);
    expect(c.finalsLost).toEqual([]);
    expect(c.rsTitles).toEqual([{ season: 55, group: 'AM' }, { season: 80, group: 'PL' }]);
    expect(c.mvps).toEqual([
      { season: 55, award: 'MVP-D2', playerId: 'p00001' }, { season: 55, award: 'MVP-D2', playerId: 'p00001' }, { season: 70, award: 'MVP-PL', playerId: 'p00003' },
    ]);
    expect(c.seriesMvps).toEqual([{ season: 70, title: 'PL Champion', playerId: 'p00003' }]);
    expect(c.picks).toEqual([
      { season: 70, pick: 1, playerId: 'p00003', name: 'A Guy' }, { season: 70, pick: 2, playerId: null, name: 'B Guy' },
    ]);
    const l = d2TeamCase(teams[1], [s55, s70], null);
    expect(l.finalsLost).toEqual([{ season: 55, title: 'D2 Champion' }, { season: 70, title: 'PL Champion' }]);
    expect(l.picks).toEqual([]);
  });
  it('matches awards by team name', () => {
    const s = { ...base, season: 60, champions: [], awards: [{ award: 'MVP-AM', playerId: 'p00005', teamId: 'Osaka Kings' }] } as SummaryFile;
    expect(d2TeamCase(teams[0], [s], null).mvps).toEqual([{ season: 60, award: 'MVP-AM', playerId: 'p00005' }]);
  });
});

describe('d2PlayerHonours', () => {
  const drafts: D2DraftHistoryFile = { drafts: [{ season: 50, picks: [
    { pick: 4, teamId: 'OSK', teamName: 'Osaka', name: 'A Guy', playerId: 'p00003', pos: 'PG', age: 19, rating: null },
  ] }] };
  it('writes the three text forms oldest first', () => {
    expect(d2PlayerHonours('p00003', [s70, s55], drafts, teams)).toEqual([
      { season: 50, text: 'D2 draft: pick 4 (Osaka Kings)' },
      { season: 70, text: 'Premier League MVP (Osaka Kings)' },
      { season: 70, text: 'Series MVP, PL Champion' },
    ]);
    expect(d2PlayerHonours('p00002', [s55, s70], null, teams).map(h => h.text)).toEqual(['International League MVP (Old Town)', 'D2 MVP (Other)']);
  });
});
