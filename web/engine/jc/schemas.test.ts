import { describe, expect, it } from 'vitest';
import { schemaForPath } from '../shared/schemaRegistry';
import { JcRankingsFile, JcScheduleFile, ScheduleFile } from '../shared/types';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
const schedule = () => ({
  league: 'fbajc', season: 79, locked: false,
  tournaments: [{ id: 'T1', name: 'Alpha Classic', teams: ids(8) }],
  days: [
    { day: 1, kind: 'tournament', games: [{ gameNo: 1, home: 't0', away: 't1', tournament: 'T1' }] },
    { day: 2, kind: 'tournament', games: [] },
  ],
  drawKeys: { t0: 0.5 },
});
const rankings = () => ({ league: 'fbajc', season: 79, locked: false, snapshots: [{ afterDay: 0, order: ids(216) }] });

describe('JC schemas', () => {
  it('parses a valid schedule and rankings', () => {
    expect(JcScheduleFile.safeParse(schedule()).success).toBe(true);
    expect(JcRankingsFile.safeParse(rankings()).success).toBe(true);
  });

  it('rejects a tournament with 7 teams', () => {
    const s = schedule();
    s.tournaments[0].teams = ids(7);
    expect(JcScheduleFile.safeParse(s).success).toBe(false);
  });

  it('rejects a tournament with duplicate teams', () => {
    const s = schedule();
    s.tournaments[0].teams = [...ids(7), 't0'];
    expect(JcScheduleFile.safeParse(s).success).toBe(false);
  });

  it('rejects duplicate day numbers', () => {
    const s = schedule();
    s.days[1].day = 1;
    expect(JcScheduleFile.safeParse(s).success).toBe(false);
  });

  it('rejects a day outside 1..29 and a non-positive gameNo', () => {
    const a = schedule();
    a.days[1].day = 30;
    expect(JcScheduleFile.safeParse(a).success).toBe(false);
    const b = schedule();
    b.days[0].games[0].gameNo = 0;
    expect(JcScheduleFile.safeParse(b).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(JcScheduleFile.safeParse({ ...schedule(), extra: 1 }).success).toBe(false);
    expect(JcRankingsFile.safeParse({ ...rankings(), extra: 1 }).success).toBe(false);
  });
});

describe('JC paths', () => {
  it('routes fbajc schedule and rankings to the JC schemas', () => {
    expect(schemaForPath('leagues/fbajc/S79/schedule.json')).toBe(JcScheduleFile);
    expect(schemaForPath('leagues/fbajc/S79/rankings.json')).toBe(JcRankingsFile);
  });

  it('keeps fba/fbad2 schedule on the old schema and refuses rankings elsewhere', () => {
    expect(schemaForPath('leagues/fbad2/S79/schedule.json')).toBe(ScheduleFile);
    expect(schemaForPath('leagues/fba/S79/schedule.json')).toBe(ScheduleFile);
    expect(schemaForPath('leagues/fba/S79/rankings.json')).toBeNull();
    expect(schemaForPath('leagues/fbawc/S79/schedule.json')).toBeNull();
  });
});
