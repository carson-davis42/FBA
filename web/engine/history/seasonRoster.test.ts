import { describe, expect, it } from 'vitest';
import type { PlayersFile } from '../shared/types';
import { rosterFromBios } from './seasonRoster';

const players: PlayersFile = {
  nextId: 5,
  players: Object.fromEntries(['Ann Able', 'Bo Baker', 'Cy Cole', 'Di Dunn'].map((name, i) => [`p0000${i + 1}`, { id: `p0000${i + 1}`, name, birthSeason: 40 }])),
};
const bio = (playerId: string, ...entries: string[]) => ({ playerId, born: 'Born-S40', entries });
const bios = {
  league: 'fba' as const,
  bios: [
    bio('p00001', 'Wake Forest-S58-S60', 'S59 FOY', '1x All-American', 'D2(San Jose)-S61-S64', 'S62 MVP-D2', 'WC(USA)-S62'),
    bio('p00002', 'D2(San Jose)-S62-pres.', 'WC(USA)-S62-S63'),
    bio('p00003', 'Duke-S58-S60'),
    bio('p00004', 'D2(Roma Pallacanestro)-S62'),
  ],
};

describe('rosterFromBios', () => {
  it('lists the players on a D2 club in a season, with that season\'s honours', () => {
    const rows = rosterFromBios('d2', 'San Jose', 62, { players, bios });
    expect(rows.map(r => r.name)).toEqual(['Ann Able', 'Bo Baker']);
    expect(rows[0].honours).toEqual(['MVP-D2']);
    expect(rosterFromBios('d2', 'San Jose', 60, { players, bios })).toEqual([]);
  });
  it('lists a national team from the World Cup call-ups', () => {
    expect(rosterFromBios('wc', 'USA', 62, { players, bios }).map(r => r.name)).toEqual(['Ann Able', 'Bo Baker']);
    expect(rosterFromBios('wc', 'USA', 64, { players, bios })).toEqual([]);
  });
  it('lists a college by school, ignoring case and punctuation, with dated honours only', () => {
    const rows = rosterFromBios('college', 'wake-forest', 59, { players, bios });
    expect(rows).toEqual([{ playerId: 'p00001', name: 'Ann Able', honours: ['FOY'] }]);
    expect(rosterFromBios('college', 'Wake Forest', 60, { players, bios })[0].honours).toEqual([]);
  });
  it('gives nobody for an unknown team or without bios', () => {
    expect(rosterFromBios('college', 'Kansas', 59, { players, bios })).toEqual([]);
    expect(rosterFromBios('d2', 'San Jose', 62, { players, bios: null })).toEqual([]);
  });
});
