import { describe, expect, it } from 'vitest';
import type { HallOfFameFile, PlayersFile, SummaryFile } from '../shared/types';
import { mulberry32 } from '../d2/random';
import { captainProblems, drawChampionCaptains, captainRules, championCaptains, latestHofClass, suggestYoungCaptains } from './youngCaptains';

const person = (n: number, name: string) => [`p0000${n}`, { id: `p0000${n}`, name }] as const;
const players = { players: Object.fromEntries([person(1, 'Ann Able'), person(2, 'Bob Best'), person(3, 'Cy Cole'), person(4, 'Di Dunn'), person(5, 'Ed Eve'), person(6, 'Twin One'), person(7, 'Twin One')]) } as unknown as PlayersFile;
const inductee = (id: string) => ({ name: id, playerId: id, retiredSeason: 'S70', lines: [] });
const hof: HallOfFameFile = {
  league: 'fba', nominees: [], removed: [],
  classes: [{ season: 'S77', inductees: [inductee('p00005')] }, { season: 'S78', inductees: [inductee('p00001'), inductee('p00002'), { ...inductee('x'), name: 'Ed Eve', playerId: null }] }],
};
const won = (season: number, ysgWinner: string | null): SummaryFile => ({
  league: 'fba', season, locked: true, host: null, champions: [],
  allStar: { allStars: [], youngStars: [], asgMvp: null, fivePoint: null, dunk: null, ysgWinner },
}) as SummaryFile;
const seasons = [won(60, 'Team Di Dunn'), won(70, 'Team Cy Cole'), won(65, 'Eastern Conference'), won(50, 'Team Twin One'), won(40, 'Team Cy Cole'), won(30, null)];

describe('Young-Star captains', () => {
  it('the latest Hall of Fame class is the last one, finding an inductee with no id by name', () => {
    expect(latestHofClass(hof, players)).toEqual(['p00001', 'p00002', 'p00005']);
    expect(latestHofClass(null, players)).toEqual([]);
  });

  it('past champion captains come newest first, once each, skipping conference winners and shared names', () => {
    expect(championCaptains(seasons, players)).toEqual(['p00003', 'p00004']);
  });

  it('suggests the Hall of Fame class first and fills the rest with champion captains drawn at random', () => {
    const rules = captainRules(hof, seasons, players);
    expect(suggestYoungCaptains(rules, [], mulberry32(1)).slice(0, 3)).toEqual(['p00001', 'p00002', 'p00005']);
    const fourth = new Set(Array.from({ length: 40 }, (_, i) => suggestYoungCaptains(rules, [], mulberry32(i))[3]));
    expect([...fourth].sort()).toEqual(['p00003', 'p00004']);
    expect(suggestYoungCaptains(rules, ['p00003'], mulberry32(1))).toEqual(['p00001', 'p00002', 'p00005', 'p00004']);
  });

  it('draws different champion captains, never one excluded or short of the pool', () => {
    const rules = captainRules(hof, seasons, players);
    const two = drawChampionCaptains(rules, [], [], 2, mulberry32(7));
    expect([...two].sort()).toEqual(['p00003', 'p00004']);
    expect(drawChampionCaptains(rules, [], ['p00003'], 2, mulberry32(7))).toEqual(['p00004']);
    expect(drawChampionCaptains(rules, [], [], 0, mulberry32(7))).toEqual([]);
  });

  it('flags a captain outside both groups and a Hall of Fame member left out', () => {
    const rules = captainRules(hof, seasons, players);
    expect(captainProblems(['p00001', 'p00002', 'p00005', 'p00003'], [], rules)).toEqual([]);
    expect(captainProblems(['p00001', 'p00002', 'p00005', 'p00006'], [], rules)).toHaveLength(1);
    expect(captainProblems(['p00001', 'p00003', 'p00004', 'p00006'], [], rules)).toHaveLength(2);
  });
});
