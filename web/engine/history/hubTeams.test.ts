import { describe, expect, it } from 'vitest';
import type { PastBracket, PlayoffSeries, SummaryFile } from '../shared/types';
import { d2LeagueChampions, fbaSemifinalists, jcFinalFour } from './hubTeams';

const summary = (extra: Record<string, unknown>) => ({ league: 'fba', season: 79, locked: true, host: null, champions: [], ...extra }) as unknown as SummaryFile;
const series = (id: string, home: string, away: string): PlayoffSeries => ({
  id, group: id[0], round: 3, home, away, homeSeed: 1, awaySeed: 2, homeWins: 4, awayWins: 1, winner: home, next: null,
});

describe('fbaSemifinalists', () => {
  it('is the four teams of the two conference finals', () => {
    const s = summary({ bracket: { seeds: [], series: [series('E-R1-1', 'X', 'Y'), series('E-CF', 'BOS', 'MW'), series('W-CF', 'CGG', 'DEN')] } });
    expect(fbaSemifinalists(s)).toEqual(['BOS', 'MW', 'CGG', 'DEN']);
  });
  it('falls back to the champion and runner-up when the season has no bracket', () => {
    const s = summary({ champions: [{ title: 'FBA Champion', champion: 'Boston', runnerUp: 'Maine', score: null, teamId: 'BOS', runnerUpId: 'MW' }] });
    expect(fbaSemifinalists(s)).toEqual(['BOS', 'MW']);
  });
  it('is empty with neither', () => {
    expect(fbaSemifinalists(summary({}))).toEqual([]);
  });
});

describe('d2LeagueChampions', () => {
  it('is each league champion, in league order', () => {
    const s = summary({ league: 'fbad2', champions: [
      { title: 'Premier League Champion', champion: 'Salzburg', runnerUp: null, score: null, teamId: 'SALZ', group: 'PL' },
      { title: 'World League Champion', champion: 'Moscow', runnerUp: null, score: null, teamId: 'MOS', group: 'WL' },
      { title: 'Rest', champion: 'No id', runnerUp: null, score: null },
    ] });
    expect(d2LeagueChampions(s)).toEqual(['SALZ', 'MOS']);
  });
});

describe('jcFinalFour', () => {
  const side = (name: string) => ({ name, record: null, seed: 1 });
  const b = (rounds: number): PastBracket => ({
    rounds,
    series: [
      { id: 'R5-1', round: 5, home: side('Duke'), away: side('UNC'), homeWins: 1, awayWins: 0, winner: 'home' },
      { id: 'R5-2', round: 5, home: side('Kansas'), away: side('Houston'), homeWins: 0, awayWins: 1, winner: 'away' },
      { id: 'R6-1', round: 6, home: side('Duke'), away: side('Houston'), homeWins: 1, awayWins: 0, winner: 'home' },
    ],
  }) as unknown as PastBracket;
  it('is the four teams of the two semifinals of a 64-team bracket', () => {
    expect(jcFinalFour(summary({ league: 'fbajc', pastBracket: b(6) }))).toEqual(['Duke', 'UNC', 'Kansas', 'Houston']);
  });
  it('is empty for another bracket size or none', () => {
    expect(jcFinalFour(summary({ league: 'fbajc', pastBracket: b(5) }))).toEqual([]);
    expect(jcFinalFour(summary({ league: 'fbajc' }))).toEqual([]);
  });
});
