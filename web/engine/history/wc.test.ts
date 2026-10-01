import { describe, expect, it } from 'vitest';
import type { SummaryFile } from '../shared/types';
import { titlesByCountry, wcTitleRows } from './wc';

const s = (season: number, champion: string, teamId?: string): SummaryFile => ({ league: 'fbawc', season, locked: true, host: 'Croatia', champions: [{ title: 'World Cup Champion', champion, runnerUp: 'Italy', score: null, teamId, finalsMvp: 'p1' }] });

describe('World Cup history rows', () => {
  const rows = wcTitleRows([s(58, 'Canada', 'CAN'), s(78, 'Germany', 'GER'), { league: 'fbawc', season: 80, locked: false, host: 'India', champions: [] }, s(66, 'Germany', 'GER')]);
  it('lists played tournaments newest first', () => {
    expect(rows.map(r => r.season)).toEqual([78, 66, 58]);
    expect(rows[0]).toMatchObject({ host: 'Croatia', champion: 'Germany', championId: 'GER', runnerUp: 'Italy', mvp: 'p1' });
  });
  it('carries a generated MVP name', () => {
    const g: SummaryFile = { league: 'fbawc', season: 80, locked: true, host: 'India', champions: [{ title: 'World Cup Champion', champion: 'Italy', runnerUp: 'Spain', score: null, finalsMvp: null, mvpName: 'Italy PG' }] };
    expect(wcTitleRows([g])[0]).toMatchObject({ mvp: null, mvpName: 'Italy PG' });
    expect(rows[0].mvpName).toBeNull();
  });
  it('counts titles by country', () => {
    expect(titlesByCountry(rows)).toEqual([
      { country: 'Germany', teamId: 'GER', titles: 2, seasons: [66, 78] },
      { country: 'Canada', teamId: 'CAN', titles: 1, seasons: [58] },
    ]);
  });
});
