import { afterAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { SummaryFile, type CalendarFile, type QualifyingFile, type RosterEntry, type RostersFile } from '../shared/types';
import { CITY_COUNTRY } from './countries';
import { finishQualifying, playQualifyingGame, startQualifying } from './qualifying';
import { qualifyingStepId, worldCupStepId } from './state';
import { wcWrites } from './writes';
import { startWorldCup } from './worldcup';

const countries = Array.from({ length: 85 }, (_, i) => `C${String(i).padStart(2, '0')}`);
const addedCities: string[] = [];
afterAll(() => { for (const c of addedCities) delete CITY_COUNTRY[c]; });
const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

function d2(season: number): RostersFile {
  const teams: Record<string, RosterEntry[]> = {};
  countries.slice(0, 40).forEach((c, i) => {
    const city = `CITY${i}`;
    CITY_COUNTRY[city] = c;
    addedCities.push(city);
    teams[city] = POS.map((position, k) => ({ playerId: `p${String(i * 5 + k + 1).padStart(5, '0')}`, position, rating: 60 + i + k, age: 25, points: 0 }));
  });
  return { league: 'fbad2', season, locked: false, teams };
}

const calendar = (season: number): CalendarFile => ({
  season,
  steps: [
    { id: 'prev', label: 'Prev', kind: 'offseason', league: null, sub: false, done: true },
    { id: qualifyingStepId(season), label: `S${season} Qualifying`, kind: 'league', league: 'fbawc', sub: false, done: season === 80 },
    { id: worldCupStepId(season), label: `S${season} World Cup`, kind: 'league', league: 'fbawc', sub: false, done: false },
  ],
});

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
}

describe('wcWrites', () => {
  it('maps a qualifying start, a game and a finish to their documents', () => {
    const r = ok(startQualifying({ season: 79, calendar: calendar(79), d2Rosters: d2(79), countries, host: 'C39', previousWc: null }, mulberry32(1)));
    expect(wcWrites(r)).toEqual([
      { path: 'leagues/fbawc/S79/rosters.json', doc: r.state.rosters },
      { path: 'leagues/fbawc/S79/qualifying.json', doc: r.state.qualifying },
    ]);
    let s = r.state;
    const g = ok(playQualifyingGame(s, mulberry32(2)));
    expect(wcWrites(g)).toEqual([{ path: 'leagues/fbawc/S79/qualifying.json', doc: g.state.qualifying }]);
    s = g.state;
    const rng = mulberry32(3);
    while (s.qualifying!.games.length < s.qualifying!.schedule.length) s = ok(playQualifyingGame(s, rng)).state;
    const f = ok(finishQualifying(s));
    expect(wcWrites(f)).toEqual([
      { path: 'calendar.json', doc: f.state.calendar },
      { path: 'leagues/fbawc/S79/qualifying.json', doc: f.state.qualifying },
    ]);
  });

  it('maps a world cup start to the worldcup and rosters documents', () => {
    const qualifying: QualifyingFile = {
      league: 'fbawc', season: 79, host: 'C70', auto: countries.slice(70, 85), field: countries.slice(0, 70),
      schedule: [], keys: {}, games: [], advanced: countries.slice(0, 49),
    };
    const prevTeams: Record<string, RosterEntry[]> = {};
    countries.forEach((c, i) => { prevTeams[c] = POS.map(position => ({ playerId: null, position, rating: 20 + i, age: 31, points: 0 })); });
    const previous: RostersFile = { league: 'fbawc', season: 79, locked: true, teams: prevTeams };
    const r = ok(startWorldCup({ season: 80, calendar: calendar(80), d2Rosters: d2(80), countries, qualifying, previous }, mulberry32(1)));
    const w = wcWrites(r);
    expect(w.map(x => x.path)).toEqual(['leagues/fbawc/S80/rosters.json', 'leagues/fbawc/S80/worldcup.json']);
    expect(w[0].doc).toBe(r.state.rosters);
    expect(w[1].doc).toBe(r.state.worldCup);
  });
});

describe('Champion.mvpName', () => {
  const summary = (mvp: Record<string, unknown>) => ({
    league: 'fbawc', season: 80, locked: true, host: null,
    champions: [{ title: 'World Cup', champion: 'Italy', runnerUp: null, score: null, ...mvp }],
  });
  it('accepts a generated MVP name with a null finalsMvp and rejects an empty one', () => {
    expect(SummaryFile.safeParse(summary({ finalsMvp: null, mvpName: 'Italy PG' })).success).toBe(true);
    expect(SummaryFile.safeParse(summary({ finalsMvp: null, mvpName: '' })).success).toBe(false);
  });
});
