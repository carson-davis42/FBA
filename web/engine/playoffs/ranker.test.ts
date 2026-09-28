import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { powerRankings, type RankGame } from './ranker';

const JAVA = path.join(__dirname, '..', '..', '..', 'FBA');

function javaResults(count: number): RankGame[] {
  return readFileSync(path.join(JAVA, 'Results.txt'), 'utf8').split(/\r?\n/)
    .filter(l => l.trim().length > 1)
    .slice(0, count)
    .map(l => {
      const a = l.trim().split(',');
      return { home: a[1], homePts: Number(a[2]), away: a[3], awayPts: Number(a[4]) };
    });
}

function javaRankings(): string[] {
  return readFileSync(path.join(JAVA, 'Rankings.txt'), 'utf8').split(/\r?\n/)
    .filter(l => /^\d+\./.test(l))
    .map(l => l.replace(/^\d+\./, '').split(':')[0]);
}

describe('powerRankings', () => {
  it('reproduces the Java Rankings.txt from the first 1280 games of Results.txt', () => {
    const java = javaRankings();
    expect(java).toHaveLength(30);
    expect(powerRankings(javaResults(1280))).toEqual(java);
  });

  it('ranks a clear chain best-first and leaves winless teams out', () => {
    const g = (home: string, homePts: number, away: string, awayPts: number): RankGame => ({ home, homePts, away, awayPts });
    // A beats B and C; B beats C; C never wins.
    expect(powerRankings([g('A', 90, 'B', 70), g('B', 80, 'C', 60), g('A', 85, 'C', 60)])).toEqual(['A', 'B']);
  });

  it('skips tied games and lets a later meeting replace the edge cost', () => {
    const g = (home: string, homePts: number, away: string, awayPts: number): RankGame => ({ home, homePts, away, awayPts });
    expect(powerRankings([g('A', 70, 'B', 70)])).toEqual([]);
    // Both teams have one win over the other; a blowout replaces A's narrow win, so A's path cost is lower.
    const narrowThenBlowout = [g('A', 71, 'B', 70), g('B', 71, 'A', 70), g('A', 110, 'B', 70)];
    expect(powerRankings(narrowThenBlowout)[0]).toBe('A');
  });
});
