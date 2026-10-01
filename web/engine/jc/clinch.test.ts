import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { jcClinch } from './clinch';
import type { JcRow } from './standings';

afterEach(cleanup);

const row = (teamId: string, confW: number, confL: number): JcRow => ({ teamId, w: confW, l: confL, confW, confL, pf: 0, pa: 0, rank: null });

describe('jcClinch', () => {
  it('a team 4 games up with 3 left is champion', () => {
    // A: 15-4 (3 left), B: 11-8 with 3 left => B max 14 < 15
    const c = jcClinch([row('A', 15, 4), row('B', 11, 8), row('C', 5, 14)]);
    expect(c.A).toBe('champion');
    expect(c.B).toBeNull();
  });
  it('a team tied at the top with games left is not champion', () => {
    const c = jcClinch([row('A', 12, 7), row('B', 12, 7)]);
    expect(c.A).toBeNull();
    expect(c.B).toBeNull();
  });
  it('clinches a share when the rival can at most tie', () => {
    const c = jcClinch([row('A', 15, 4), row('B', 12, 7)]);
    expect(c.A).toBe('champion');
  });
});
