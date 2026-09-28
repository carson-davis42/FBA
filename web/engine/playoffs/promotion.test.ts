import { describe, expect, it } from 'vitest';
import { promotion } from './promotion';

const league = (g: string) => Array.from({ length: 16 }, (_, k) => `${g}${k + 1}`);
const order = { PL: league('PL'), WL: league('WL'), UL: league('UL'), IL: league('IL') };

describe('promotion (S78 rule)', () => {
  it('promotes #1 and the playoff champion, and relegates the bottom two', () => {
    expect(promotion(order, { PL: 'PL3', WL: 'WL5', UL: 'UL2', IL: 'IL8' })).toEqual([
      { league: 'PL', promoted: [], relegated: ['PL15', 'PL16'] },
      { league: 'WL', promoted: ['WL1', 'WL5'], relegated: ['WL15', 'WL16'] },
      { league: 'UL', promoted: ['UL1', 'UL2'], relegated: ['UL15', 'UL16'] },
      { league: 'IL', promoted: ['IL1', 'IL8'], relegated: [] },
    ]);
  });

  it('promotes #2 when #1 also won the playoffs', () => {
    const lines = promotion(order, { PL: 'PL1', WL: 'WL1', UL: 'UL1', IL: 'IL1' });
    expect(lines.map(l => l.promoted)).toEqual([[], ['WL1', 'WL2'], ['UL1', 'UL2'], ['IL1', 'IL2']]);
  });
});
