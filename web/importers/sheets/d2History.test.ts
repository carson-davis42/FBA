import { describe, expect, it } from 'vitest';
import { d2DraftTabSeason, parseAwardsTab, parseD2DraftTab, parseIntlChampionships, parseLeagueChampionships, parseMvpCell, parseSeasonCell, parseTeamLeagueHistory } from './d2History';

describe('D2 sheet parsers', () => {
  it('reads season cells and MVP cells', () => {
    expect(parseSeasonCell('S55(2)')).toEqual({ season: 55, half: 2 });
    expect(parseSeasonCell('S60')).toEqual({ season: 60, half: null });
    expect(parseSeasonCell('Year')).toBeNull();
    expect(parseMvpCell('Jordan-Lee Davidson-D2(Dhaka)')).toEqual({ name: 'Jordan-Lee Davidson', team: 'Dhaka' });
    expect(parseMvpCell('X')).toBeNull();
  });

  it('reads team league history with Est, single-season and pres. spells', () => {
    const rows = [
      ['Premier League', '(+): Set to be Promoted', '(-): Set to be Relegated'],
      ['Madrid', 'Euro-South: S56-S67', 'WL: S68', 'PL: S75-pres.'],
      ['World League'],
      ['Zagreb (+)', 'Est: S71', 'UL: S71', 'WL: S71-pres.'],
    ];
    expect(parseTeamLeagueHistory(rows)).toEqual([
      { name: 'Madrid', founded: null, spells: [{ group: 'ES', from: 56, to: 67 }, { group: 'WL', from: 68, to: 68 }, { group: 'PL', from: 75, to: null }] },
      { name: 'Zagreb', founded: 71, spells: [{ group: 'UL', from: 71, to: 71 }, { group: 'WL', from: 71, to: null }] },
    ]);
    expect(() => parseTeamLeagueHistory([['Rome', 'XL: S1-S2']])).toThrow(/can't read/);
  });

  it('reads the international and league championship tabs', () => {
    expect(parseIntlChampionships([
      ['Year', 'Champion', 'Runner-Up', 'Series MVP', 'Date'],
      ['S55(1)', 'Syracuse', 'San Jose', 'Myles Hamilton', 'X'],
    ])).toEqual([{ season: 55, half: 1, group: 'D2', champion: 'Syracuse', runnerUp: 'San Jose', seriesMvp: 'Myles Hamilton' }]);
    const league = parseLeagueChampionships([
      ['Year', 'PL Champion', 'PL Runner-Up', 'Series MVP', 'Date', '', 'WL Champion', 'WL Runner-Up', 'Series MVP', 'Date', '', 'UL Champion', 'UL Runner-Up', 'Series MVP', 'Date', '', 'IL Champion', 'IL Runner-Up', 'Series MVP', 'Date'],
      ['S71', 'Hamburg', 'Madrid', 'Derrick Burns', 'd', '', 'Austin', 'Tokyo', 'Bobbie Allen', 'd', '', 'Zagreb', 'Buenos Aires', 'Milo Blanchard', 'd', '', 'X', 'X', 'X', 'X'],
    ]);
    expect(league.map(t => `${t.group}:${t.champion}>${t.runnerUp}:${t.seriesMvp}`)).toEqual(['PL:Hamburg>Madrid:Derrick Burns', 'WL:Austin>Tokyo:Bobbie Allen', 'UL:Zagreb>Buenos Aires:Milo Blanchard']);
  });

  it('reads both awards tabs by header, with co-champions and X', () => {
    const early = parseAwardsTab([
      ['Year', 'D2 MVP', 'D2-America Champions', 'D2-America MVP', 'Euro-West Champions', 'Euro-West MVP', 'Euro-East Champions', 'Euro-East MVP', 'Euro-South Champions', 'Euro-South MVP'],
      ['S57', 'Myles Hamilton-D2(Rome)', 'Toronto/San Jose', 'X', 'Lyon/London', 'X', 'Vienna', 'X', 'Rome', 'X'],
      ['S53', 'Westin Winter-D2(San Jose)', 'San Jose', 'X', 'X', 'X', 'X', 'X', 'X', 'X'],
    ]);
    expect(early[0].mvps).toEqual([{ award: 'MVP-D2', cell: { name: 'Myles Hamilton', team: 'Rome' } }]);
    expect(early[0].rsChampions).toEqual([{ group: 'AM', teams: ['Toronto', 'San Jose'] }, { group: 'EW', teams: ['Lyon', 'London'] }, { group: 'EE', teams: ['Vienna'] }, { group: 'ES', teams: ['Rome'] }]);
    expect(early[1].rsChampions).toEqual([{ group: 'AM', teams: ['San Jose'] }]);
    const late = parseAwardsTab([
      ['Year', 'Premier League RS Champions', 'Premier League MVP', 'World League RS Champions', 'World League MVP', 'United League RS Champions', 'United League MVP', 'International League RS Champions', 'International League MVP'],
      ['S69', 'Munich/Rome', 'Billie Hodges-D2(Rome)', 'Glasgow', 'Dennis Holloway-D2(Glasgow)', 'Madrid/Vancouver', 'Jaydon Cantrell-D2(Madrid)', 'X', 'X'],
    ]);
    expect(late[0].season).toBe(69);
    expect(late[0].mvps.map(m => m.award)).toEqual(['MVP-PL', 'MVP-WL', 'MVP-UL']);
    expect(late[0].rsChampions[0]).toEqual({ group: 'PL', teams: ['Munich', 'Rome'] });
    expect(late[0].rsChampions).toHaveLength(3);
  });

  it('reads D2 draft tabs with and without ratings and skips the trailing header', () => {
    expect(d2DraftTabSeason('S70 D2')).toBe(70);
    expect(d2DraftTabSeason('S70')).toBeNull();
    expect(parseD2DraftTab([['Brussels', 'Jonathan Rudd', 'SG', '25'], ['Berlin', 'Jaden Samuels', 'SF', '29', '97'], ['TEAM', 'PLAYER', 'POSITION', 'AGE', 'RATING'], []]))
      .toEqual([{ team: 'Brussels', name: 'Jonathan Rudd', pos: 'SG', age: 25, rating: null }, { team: 'Berlin', name: 'Jaden Samuels', pos: 'SF', age: 29, rating: 97 }]);
  });
});
