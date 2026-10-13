import { describe, expect, it } from 'vitest';
import { formatDay, formatSpan } from './dates';
import { CalendarFile, Champion, DraftHistoryFile, JcSummary, SummaryFile } from './types';

describe('formatDay', () => {
  it('formats a day and a datetime in UTC', () => {
    expect(formatDay('2026-10-12')).toBe('Oct 12, 2026');
    expect(formatDay('2026-10-12T23:59:00.000Z')).toBe('Oct 12, 2026');
  });
  it('returns null for null or invalid input', () => {
    expect(formatDay(null)).toBeNull();
    expect(formatDay(undefined)).toBeNull();
    expect(formatDay('nope')).toBeNull();
  });
});

describe('formatSpan', () => {
  it('shows the year once within a year', () => {
    expect(formatSpan('2026-10-01T10:00:00.000Z', '2026-10-12T09:00:00.000Z')).toBe('Oct 1 – Oct 12, 2026');
  });
  it('shows both years across years', () => {
    expect(formatSpan('2026-12-20T10:00:00.000Z', '2027-01-04T09:00:00.000Z')).toBe('Dec 20, 2026 – Jan 4, 2027');
  });
  it('collapses a same-day span to one date', () => {
    expect(formatSpan('2026-10-12T01:00:00.000Z', '2026-10-12T22:00:00.000Z')).toBe('Oct 12, 2026');
  });
  it('returns null when an end is missing or invalid', () => {
    expect(formatSpan(null, '2026-10-12T00:00:00.000Z')).toBeNull();
    expect(formatSpan('2026-10-01T00:00:00.000Z', 'x')).toBeNull();
  });
});

describe('date fields in the schemas', () => {
  const champ = { title: 'FBA Finals', champion: 'Boston', runnerUp: null, score: null };
  it('Champion.date accepts a day or null and rejects other shapes', () => {
    expect(Champion.safeParse({ ...champ, date: '2026-10-12' }).success).toBe(true);
    expect(Champion.safeParse({ ...champ, date: null }).success).toBe(true);
    expect(Champion.safeParse(champ).success).toBe(true);
    expect(Champion.safeParse({ ...champ, date: '10/12/2026' }).success).toBe(false);
  });
  it('JcSummary nit accepts a date', () => {
    const base = { confChampions: [], national: [], conference: [], allAmerican: null, mvp: { mm: null, nit: null } };
    expect(JcSummary.safeParse({ ...base, nit: { champion: 'A', runnerUp: 'B', date: '2026-03-30' } }).success).toBe(true);
    expect(JcSummary.safeParse({ ...base, nit: { champion: 'A', runnerUp: 'B', date: 'soon' } }).success).toBe(false);
  });
  it('DraftHistoryDraft.date', () => {
    const f = (date?: unknown) => ({ drafts: [{ season: 60, kind: 'draft', ...(date === undefined ? {} : { date }), picks: [] }] });
    expect(DraftHistoryFile.safeParse(f('2026-06-25')).success).toBe(true);
    expect(DraftHistoryFile.safeParse(f(null)).success).toBe(true);
    expect(DraftHistoryFile.safeParse(f()).success).toBe(true);
    expect(DraftHistoryFile.safeParse(f('June 25')).success).toBe(false);
  });
  it('SummaryFile.span', () => {
    const doc = { league: 'fba', season: 80, locked: true, host: null, champions: [] };
    expect(SummaryFile.safeParse({ ...doc, span: { opened: '2026-10-01T10:00:00.000Z', locked: '2026-10-12T09:00:00.000Z' } }).success).toBe(true);
    expect(SummaryFile.safeParse(doc).success).toBe(true);
    expect(SummaryFile.safeParse({ ...doc, span: { opened: '2026-10-01T10:00:00.000Z' } }).success).toBe(false);
    expect(SummaryFile.safeParse({ ...doc, span: { opened: 'x', locked: 'y' } }).success).toBe(false);
  });
  it('CalendarFile.startedAt', () => {
    expect(CalendarFile.safeParse({ season: 80, steps: [], startedAt: '2026-10-01T10:00:00.000Z' }).success).toBe(true);
    expect(CalendarFile.safeParse({ season: 80, steps: [] }).success).toBe(true);
    expect(CalendarFile.safeParse({ season: 80, steps: [], startedAt: 'yesterday' }).success).toBe(false);
  });
});
