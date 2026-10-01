import { describe, expect, it } from 'vitest';
import type { PastBracket, SummaryFile } from '../../engine/shared/types';
import { PastBracket as PastBracketSchema, SummaryFile as SummaryFileSchema } from '../../engine/shared/types';
import { convertTranscript } from './convertBrackets';
import { mergeBrackets } from './mergeBrackets';

/** A transcript for an n-slot bracket where the lower slot number always wins; `ot` marks the final as an overtime game. */
function transcript(season: number, slots: number, opts: { kind?: 'NIT'; ot?: boolean; byes?: number[] } = {}): string {
  const lines = [`S${season}`];
  if (opts.kind) lines.push(`K:${opts.kind}`);
  const byes = new Set(opts.byes ?? []);
  for (let i = 1; i <= slots; i++) lines.push(byes.has(i) ? 'BYE' : `${i}|Team ${i}|20-${i % 9}`);
  let sides = Array.from({ length: slots }, (_, i) => i + 1);
  for (let r = 1; sides.length > 1; r++) {
    const next: number[] = [];
    const res: string[] = [];
    for (let i = 0; i < sides.length; i += 2) {
      const a = sides[i], b = sides[i + 1];
      const win = byes.has(a) ? b : byes.has(b) ? a : Math.min(a, b);
      next.push(win);
      const bye = byes.has(a) || byes.has(b);
      res.push(bye ? `Team ${win} BYE` : sides.length === 2 && opts.ot ? `Team ${win} 48-46 OT` : `Team ${win} ${70 + r}-${60 + r}`);
    }
    lines.push(`=${res.join('|')}`);
    sides = next;
  }
  return lines.join('\n');
}

describe('convertTranscript for college pages', () => {
  it('converts a 64-slot March Madness page into a six-round bracket of single games', () => {
    const { entries } = convertTranscript(transcript(64, 64));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ season: 64, rounds: 6 });
    expect(entries[0].series).toHaveLength(63);
    expect(entries[0].kind).toBeUndefined();
    expect(PastBracketSchema.safeParse({ rounds: entries[0].rounds, series: entries[0].series }).success).toBe(true);
  });
  it('keeps an overtime score with its suffix', () => {
    const { entries } = convertTranscript(transcript(70, 16, { ot: true }));
    const final = entries[0].series.find(s => s.round === 4)!;
    expect(final.score).toBe('48–46 OT');
    expect(final.homeWins).toBe(1);
  });
  it('reads a multi-overtime score', () => {
    const t = transcript(70, 2).replace('Team 1 71-61', 'Team 1 91-88 3OT');
    expect(convertTranscript(t).entries[0].series[0].score).toBe('91–88 3OT');
  });
  it('reads byes as null sides', () => {
    const { entries } = convertTranscript(transcript(72, 8, { byes: [2] }));
    const r1 = entries[0].series.find(s => s.id === 'R1-1')!;
    expect(r1.away).toBeNull();
    expect(r1.homeWins).toBe(0);
  });
  it('marks an NIT page and lets a season have both an MM and an NIT page', () => {
    const { entries } = convertTranscript(`${transcript(72, 16)}\n${transcript(72, 32, { kind: 'NIT' })}`);
    expect(entries.map(e => [e.season, e.kind ?? 'MM', e.rounds])).toEqual([[72, 'MM', 4], [72, 'NIT', 5]]);
  });
  it('still rejects a repeated page of the same kind', () => {
    expect(() => convertTranscript(`${transcript(72, 4)}\n${transcript(72, 4)}`)).toThrow(/Duplicate/);
  });
  it('rejects an unknown page kind', () => {
    expect(() => convertTranscript(transcript(72, 4).replace('S72', 'S72\nK:XYZ'))).toThrow(/kind/);
  });
});

describe('mergeBrackets for fbajc', () => {
  const summary = (season: number, withJc = true): SummaryFile => ({
    league: 'fbajc', season, locked: true, host: null, champions: [],
    ...(withJc ? { jc: { confChampions: [], national: [], conference: [], allAmerican: null, mvp: { mm: null, nit: null }, nit: null } } : {}),
  });
  const entries = convertTranscript(`${transcript(72, 16)}\n${transcript(72, 32, { kind: 'NIT' })}\n${transcript(11, 8)}`).entries;

  it('puts the March Madness bracket on pastBracket and the NIT on jc.nitBracket', () => {
    const out = mergeBrackets('fbajc', entries, new Map([[72, summary(72)], [11, summary(11)]]));
    const s72 = out.summaries.find(s => s.season === 72)!;
    expect(s72.pastBracket!.rounds).toBe(4);
    expect(s72.jc!.nitBracket!.rounds).toBe(5);
    expect(out.report).toMatchObject({ set: 3, unchanged: 0, missingSummary: [] });
    expect(out.summaries.every(s => SummaryFileSchema.safeParse(s).success)).toBe(true);
  });
  it('is unchanged on a second run', () => {
    const first = mergeBrackets('fbajc', entries, new Map([[72, summary(72)], [11, summary(11)]]));
    const second = mergeBrackets('fbajc', entries, new Map(first.summaries.map(s => [s.season, s])));
    expect(second.report).toMatchObject({ set: 0, unchanged: 3 });
  });
  it('reports a season without a summary, and an NIT page whose summary has no jc block', () => {
    const out = mergeBrackets('fbajc', entries, new Map([[72, summary(72, false)]]));
    expect(out.report.missingSummary).toEqual(['S72 NIT', 'S11']);
    expect(out.report.set).toBe(1);
  });
  it('rejects a college entry with a D2 group', () => {
    expect(() => mergeBrackets('fbajc', [{ ...entries[0], group: 'PL' }], new Map([[72, summary(72)]]))).toThrow(/group/);
  });
  it('keeps a bracket type for the pure type guard', () => {
    const b: PastBracket = { rounds: entries[0].rounds, series: entries[0].series };
    expect(b.rounds).toBe(4);
  });
});
