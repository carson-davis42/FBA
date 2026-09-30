import { describe, expect, it } from 'vitest';
import { groupLabel } from './leagues';
import { schemaForPath } from './schemaRegistry';
import { D2DraftHistoryFile, D2LeagueHistoryFile, SummaryFile } from './types';

const base = { season: 60, locked: true, host: null, champions: [] };

describe('D2 history schemas', () => {
  it('accepts rsChampions and the new MVP ids on a D2 summary only', () => {
    const d2 = { league: 'fbad2', ...base, rsChampions: [{ group: 'AM', teams: ['San Jose', 'Toronto'] }], awards: [{ award: 'MVP-D2', playerId: 'p00001', teamId: 'Rome' }] };
    expect(SummaryFile.safeParse(d2).success).toBe(true);
    expect(SummaryFile.safeParse({ ...d2, league: 'fba', awards: [] }).success).toBe(false);
    expect(SummaryFile.safeParse({ ...d2, rsChampions: [{ group: 'AM', teams: [] }] }).success).toBe(false);
  });

  it('validates league history: unique teams, one open spell and it is last', () => {
    const ok = { teams: [{ teamId: 'ROM', founded: null, spells: [{ group: 'ES', from: 56, to: 67 }, { group: 'PL', from: 68, to: null }] }] };
    expect(D2LeagueHistoryFile.safeParse(ok).success).toBe(true);
    expect(D2LeagueHistoryFile.safeParse({ teams: [...ok.teams, ...ok.teams] }).success).toBe(false);
    expect(D2LeagueHistoryFile.safeParse({ teams: [{ teamId: 'ROM', founded: 70, spells: [{ group: 'PL', from: 68, to: null }, { group: 'WL', from: 70, to: 71 }] }] }).success).toBe(false);
    expect(D2LeagueHistoryFile.safeParse({ teams: [{ teamId: 'ROM', founded: null, spells: [{ group: 'PL', from: 70, to: 68 }] }] }).success).toBe(false);
    expect(D2LeagueHistoryFile.safeParse({ teams: [{ teamId: 'ROM', founded: null, spells: [{ group: 'D2', from: 60, to: 61 }] }] }).success).toBe(false);
  });

  it('validates D2 drafts: picks 1..n, one draft per season', () => {
    const pick = (n: number) => ({ pick: n, teamId: 'ROM', teamName: 'Rome', name: 'A B', playerId: null, pos: 'PG', age: 22, rating: null });
    expect(D2DraftHistoryFile.safeParse({ drafts: [{ season: 68, picks: [pick(1), pick(2)] }] }).success).toBe(true);
    expect(D2DraftHistoryFile.safeParse({ drafts: [{ season: 68, picks: [pick(2)] }] }).success).toBe(false);
    expect(D2DraftHistoryFile.safeParse({ drafts: [{ season: 68, picks: [] }, { season: 68, picks: [] }] }).success).toBe(false);
  });

  it('registers the two new paths and labels the past groups', () => {
    expect(schemaForPath('leagues/fbad2/leagueHistory.json')).toBe(D2LeagueHistoryFile);
    expect(schemaForPath('leagues/fbad2/draftHistory.json')).toBe(D2DraftHistoryFile);
    expect(groupLabel('fbad2', 'EW')).toBe('Euro-West');
    expect(groupLabel('fbad2', 'D2')).toBe('D2 International');
    expect(groupLabel('fbad2', 'PL')).toBe('Premier League');
  });
});
