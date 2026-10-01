import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { QualifyingFile, type CalendarFile, type RosterEntry, type RostersFile } from '../shared/types';
import { CITY_COUNTRY } from './countries';
import { finishQualifying, playQualifyingGame, qualifyingTable, sixRegularPairs, startQualifying, type QualifyingState } from './qualifying';
import { qualifyingStepId } from './state';

const ids70 = Array.from({ length: 70 }, (_, i) => `T${i}`);
const countries = Array.from({ length: 85 }, (_, i) => `C${String(i).padStart(2, '0')}`);
const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

/** D2 city rosters: city CITYn belongs to country Cnn (only the first 40 countries have cities). */
function d2(): RostersFile {
  const teams: Record<string, RosterEntry[]> = {};
  countries.slice(0, 40).forEach((c, i) => {
    const city = `CITY${i}`;
    CITY_COUNTRY[city] = c;
    teams[city] = POS.map((position, k) => ({ playerId: `p${String(i * 5 + k + 1).padStart(5, '0')}`, position, rating: 60 + i + k, age: 25, points: 0 }));
  });
  return { league: 'fbad2', season: 80, locked: false, teams };
}

const calendar = (done = false): CalendarFile => ({
  season: 80,
  steps: [
    { id: 'prev', label: 'Prev', kind: 'offseason', league: null, sub: false, done: true },
    { id: qualifyingStepId(80), label: 'S80 Qualifying', kind: 'league', league: 'fbawc', sub: false, done },
    { id: 's80-world-cup', label: 'S80 World Cup', kind: 'league', league: 'fbawc', sub: false, done: false },
  ],
});

const start = (host: string, seed = 1, cal = calendar()) =>
  startQualifying({ season: 80, calendar: cal, d2Rosters: d2(), countries, host, previousWc: null }, mulberry32(seed));

function started(host = 'C39', seed = 1): QualifyingState {
  const r = start(host, seed);
  if (!r.ok) throw new Error(r.problems.join());
  return r.state;
}

describe('sixRegularPairs', () => {
  it('makes a simple 6-regular graph, deterministically', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const pairs = sixRegularPairs(ids70, mulberry32(seed));
      expect(pairs).toHaveLength(210);
      const seen = new Set<string>();
      const deg = new Map<string, number>();
      for (const [a, b] of pairs) {
        expect(a).not.toBe(b);
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
        deg.set(a, (deg.get(a) ?? 0) + 1);
        deg.set(b, (deg.get(b) ?? 0) + 1);
      }
      expect(deg.size).toBe(70);
      for (const d of deg.values()) expect(d).toBe(6);
      expect(sixRegularPairs(ids70, mulberry32(seed))).toEqual(pairs);
    }
  });
});

describe('sixRegularPairs guard', () => {
  it('throws for fewer than 7 teams', () => {
    expect(() => sixRegularPairs(['A', 'B', 'C', 'D', 'E', 'F'], mulberry32(1))).toThrow();
  });
});

describe('startQualifying', () => {
  it('keeps a host inside the top 15', () => {
    const q = started('C39').qualifying!;
    expect(q.auto).toHaveLength(15);
    expect(q.auto).toContain('C39');
    expect(q.auto).toEqual(expect.arrayContaining(countries.slice(25, 40)));
    expect(q.field).toHaveLength(70);
  });

  it('replaces #15 with an outside host, and the old #15 joins the field', () => {
    const q = started('C84').qualifying!;
    expect(q.auto).toHaveLength(15);
    expect(q.auto).toContain('C84');
    expect(q.auto).not.toContain('C25');
    expect(q.field).toContain('C25');
    expect(q.field).not.toContain('C84');
  });

  it('partitions 85 countries, schedules 210 games and writes valid files', () => {
    const s = started('C84');
    const q = s.qualifying!;
    expect(new Set([...q.auto, ...q.field]).size).toBe(85);
    expect(q.schedule).toHaveLength(210);
    expect(q.schedule.map(g => g.gameNo)).toEqual(Array.from({ length: 210 }, (_, i) => i + 1));
    expect(QualifyingFile.safeParse(q).success).toBe(true);
    expect(Object.keys(s.rosters.teams)).toHaveLength(85);
    for (const t of Object.values(s.rosters.teams)) expect(t).toHaveLength(5);
    expect(s.rosters.locked).toBe(true);
    expect(s.rosters.league).toBe('fbawc');
  });

  it('stores a rating tie-break key for all 85 countries', () => {
    const q = started('C84').qualifying!;
    expect(Object.keys(q.keys).sort()).toEqual([...countries].sort());
  });

  it('refuses an existing qualifying document and a wrong country count', () => {
    const existing = started().qualifying!;
    const input = { season: 80, calendar: calendar(), d2Rosters: d2(), countries, host: 'C39', previousWc: null };
    expect(startQualifying({ ...input, existing }, mulberry32(1)).ok).toBe(false);
    expect(startQualifying({ ...input, existing: null }, mulberry32(1)).ok).toBe(true);
    expect(startQualifying({ ...input, countries: countries.slice(0, 84) }, mulberry32(1)).ok).toBe(false);
  });

  it('refuses when qualifying is not the current step', () => {
    expect(start('C39', 1, calendar(true)).ok).toBe(false);
  });
});

describe('play and finish', () => {
  function playAll(seed: number): QualifyingState {
    let s = started('C84', seed);
    const rng = mulberry32(seed + 100);
    for (let i = 0; i < 210; i++) {
      const r = playQualifyingGame(s, rng);
      if (!r.ok) throw new Error(r.problems.join());
      s = r.state;
    }
    return s;
  }

  it('plays 210 games, then finishes with the top 49', () => {
    const s = playAll(3);
    expect(playQualifyingGame(s, mulberry32(1)).ok).toBe(false);
    const f = finishQualifying(s);
    if (!f.ok) throw new Error(f.problems.join());
    const q = f.state.qualifying!;
    expect(q.advanced).toHaveLength(49);
    for (const t of q.advanced) expect(q.field).toContain(t);
    expect(q.advanced).toEqual(qualifyingTable(q).rows.slice(0, 49).map(r => r.teamId));
    expect(f.state.calendar.steps.find(x => x.id === qualifyingStepId(80))!.done).toBe(true);
    expect(QualifyingFile.safeParse(q).success).toBe(true);
    expect(f.label).toBe('Qualifying finished: 49 advance');
    expect(finishQualifying(f.state).ok).toBe(false);
  });

  it('refuses to finish early', () => {
    const r = playQualifyingGame(started('C84'), mulberry32(5));
    if (!r.ok) throw new Error('x');
    expect(finishQualifying(r.state).ok).toBe(false);
  });

  it('is deterministic per seed', () => {
    expect(playAll(7)).toEqual(playAll(7));
  });
});
