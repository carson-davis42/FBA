import { describe, it, expect } from 'vitest';
import { PastBracket } from '../../engine/shared/types';
import { convertTranscript } from './convertBrackets';

const S76 = `# p004 FBA D2 World League Tournament
S76
G:WL
1|Rome|25-5
8|Liverpool|15-15
5|Hamburg|19-11
4|Sydney|20-10
3|Sao Paolo|23-7
6|Zurich|16-14
7|Dhaka|16-14
2|Vancouver|24-6
= Rome 4-0 | Sydney 4-3 | Sao Paolo 4-0 | Vancouver 4-0
= Rome 4-0 | Vancouver 4-3
= Vancouver 4-2
`;

describe('convertTranscript', () => {
  it('converts an eight-team league tournament page', () => {
    const { entries, warnings } = convertTranscript(S76);
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.season).toBe(76);
    expect(e.group).toBe('WL');
    expect(e.rounds).toBe(3);
    expect(e.series).toHaveLength(7);
    const final = e.series.find(s => s.id === 'R3-1')!;
    expect(final.winner).toBe('away');
    expect(final.home?.name).toBe('Rome');
    expect(final.awayWins).toBe(4);
    expect(final.homeWins).toBe(2);
  });

  it('reads numbers above 4 as a single game', () => {
    const { entries } = convertTranscript('S60\n|Japan|\n|Brazil|\n= Japan 97-75\n');
    const s = entries[0].series[0];
    expect(entries[0].group).toBeUndefined();
    expect(s.score).toBe('97–75');
    expect([s.homeWins, s.awayWins]).toEqual([1, 0]);
    expect(s.home?.seed).toBeNull();
    expect(s.home?.record).toBeNull();
  });

  it('reads a dash instead of a score as an unscored series', () => {
    const { entries } = convertTranscript('S53\n1|Rome|\n2|Oslo|\n= Rome -\n');
    const s = entries[0].series[0];
    expect(s.unscored).toBe(true);
    expect([s.homeWins, s.awayWins]).toEqual([0, 0]);
    expect(s.score).toBeUndefined();
    expect(s.winner).toBe('home');
  });

  it('still rejects other malformed results and an unscored BYE', () => {
    expect(() => convertTranscript('S53\n1|Rome|\n2|Oslo|\n= Rome --\n')).toThrow();
    expect(() => convertTranscript('S53\n1|Rome|\n2|Oslo|\n= Rome 4-\n')).toThrow();
    expect(() => convertTranscript('S53\n1|Rome|\n2|Oslo|\n= Rome\n')).toThrow();
    expect(() => convertTranscript('S53\n1|Rome|\nBYE\n= Rome -\n')).toThrow();
  });

  it('puts the loser first for an away winner in a single game', () => {
    const { entries } = convertTranscript('S60\n|Japan|\n|Brazil|\n= Brazil 80-70\n');
    const s = entries[0].series[0];
    expect(s.score).toBe('80–70');
    expect([s.homeWins, s.awayWins]).toEqual([0, 1]);
    expect(s.winner).toBe('away');
  });

  it('handles a BYE', () => {
    const { entries } = convertTranscript('S5\n1|A|5-1\nBYE\n2|B|4-2\n3|C|3-3\n= A BYE | B 4-1\n= A 4-2\n');
    const r = entries[0].series;
    expect(r[0].away).toBeNull();
    expect([r[0].homeWins, r[0].awayWins]).toEqual([0, 0]);
    expect(r[2].winner).toBe('home');
  });

  it('throws on a winner who is not in the series', () => {
    expect(() => convertTranscript('S5\n1|A|5-1\n2|B|4-2\n= C 4-1\n')).toThrow(/not in series/);
  });

  it('throws on the wrong number of results', () => {
    expect(() => convertTranscript('S5\n1|A|5-1\n2|B|4-2\n3|C|3-3\n4|D|2-4\n= A 4-1\n= A 4-2\n')).toThrow();
    expect(() => convertTranscript('S5\n1|A|5-1\n2|B|4-2\n= A 4-1 | B 4-0\n')).toThrow();
  });

  it('throws on a slot count that is not a power of two', () => {
    expect(() => convertTranscript('S5\n1|A|5-1\n2|B|4-2\n3|C|3-3\n= A 4-1\n')).toThrow();
  });

  it('throws on a BYE mismatch', () => {
    expect(() => convertTranscript('S5\n1|A|5-1\n2|B|4-2\n= A BYE\n')).toThrow(/BYE/);
  });

  it('throws on duplicate season and group', () => {
    expect(() => convertTranscript(`${S76}${S76}`)).toThrow(/uplicate/);
    const plain = 'S5\n1|A|5-1\n2|B|4-2\n= A 4-1\n';
    expect(() => convertTranscript(plain + plain)).toThrow(/uplicate/);
  });

  it('allows one season with different groups', () => {
    const { entries } = convertTranscript(`${S76}${S76.replace('G:WL', 'G:PL')}`);
    expect(entries.map(e => e.group)).toEqual(['WL', 'PL']);
  });

  it('turns a record that is not W-L into null with a warning', () => {
    const { entries, warnings } = convertTranscript('S5\n1|A|5 wins\n2|B|4-2-1\n= A 4-1\n');
    expect(entries[0].series[0].home?.record).toBeNull();
    expect(entries[0].series[0].away?.record).toBe('4-2-1');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/S5/);
  });

  it('produces a valid PastBracket for a 16-slot page', () => {
    const slots = Array.from({ length: 16 }, (_, i) => `${i + 1}|T${i + 1}|10-5`);
    const rounds = [
      Array.from({ length: 8 }, (_, i) => `T${2 * i + 1} 4-1`),
      Array.from({ length: 4 }, (_, i) => `T${4 * i + 1} 4-2`),
      Array.from({ length: 2 }, (_, i) => `T${8 * i + 1} 4-3`),
      ['T1 4-0'],
    ].map(r => `= ${r.join(' | ')}`);
    const { entries } = convertTranscript(['S9', ...slots, ...rounds].join('\n'));
    expect(entries[0].rounds).toBe(4);
    expect(entries[0].series).toHaveLength(15);
    const { season: _s, group: _g, ...bracket } = entries[0];
    expect(PastBracket.safeParse(bracket).success).toBe(true);
  });
});
