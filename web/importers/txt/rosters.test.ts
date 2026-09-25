import { describe, expect, it } from 'vitest';
import { parseRosterTxt } from './rosters';

describe('parseRosterTxt', () => {
  it('parses the FBA format', () => {
    const text = '1\r\nBoston Bucks/BOS/E\r\n2\r\nGabriel Greenwood/PG/27/3/8/96/2980\r\nX/SG/X/X/X/60/0\r\n';
    const [t] = parseRosterTxt(text, 'fba');
    expect(t).toMatchObject({ name: 'Boston Bucks', abbr: 'BOS', group: 'E' });
    expect(t.players[0]).toEqual({
      name: 'Gabriel Greenwood', position: 'PG', age: 27, rating: 96, points: 2980,
      contractLen: 3, cost: 8, stars: null, classYear: null,
    });
    expect(t.players[1]).toMatchObject({ name: null, age: null, contractLen: null, rating: 60 });
  });

  it('parses the D2 format', () => {
    const [t] = parseRosterTxt('1\nAuckland/ACK/IL\n1\nRickie Carver/PG/27/66/158\n', 'fbad2');
    expect(t.group).toBe('IL');
    expect(t.players[0]).toMatchObject({ name: 'Rickie Carver', age: 27, rating: 66, points: 158 });
  });

  it('parses the JC format with stars and class', () => {
    const [t] = parseRosterTxt('1\nBaylor/BAY/B12\n2\nJake Hollister/PG/4*/Fr/82/676\nX/SG/X/So/63/221\n', 'fbajc');
    expect(t.players[0]).toMatchObject({ stars: 4, classYear: 'Fr', rating: 82, points: 676, age: null });
    expect(t.players[1]).toMatchObject({ name: null, stars: null, classYear: 'So' });
  });

  it('parses the World Cup format with no group', () => {
    const [t] = parseRosterTxt('1\nAlgeria/ALG\n1\nX/PG/32/67\n', 'fbawc');
    expect(t).toMatchObject({ name: 'Algeria', abbr: 'ALG', group: null });
    expect(t.players[0]).toMatchObject({ name: null, age: 32, rating: 67, points: 0 });
  });

  it('upper-cases abbreviations and strips a BOM', () => {
    const [t] = parseRosterTxt('﻿1\nDuke/duke/ACC\n0\n', 'fbajc');
    expect(t.abbr).toBe('DUKE');
  });

  it('rejects a bad position', () => {
    expect(() => parseRosterTxt('1\nA/A/E\n1\nBob/G/20/1/1/70/0\n', 'fba')).toThrow(/position/);
  });

  it('rejects a wrong field count', () => {
    expect(() => parseRosterTxt('1\nA/A/E\n1\nBob/PG/20/70\n', 'fba')).toThrow(/fields/);
  });
});
