import { describe, expect, it } from 'vitest';
import { schemaForPath } from './schemaRegistry';

describe('hosts.json schema', () => {
  const schema = schemaForPath('leagues/fbawc/hosts.json')!;
  it('has a path rule and accepts hosts', () => {
    expect(schema.safeParse({ hosts: [{ season: 80, city: 'Mumbai', country: 'India' }] }).success).toBe(true);
  });
  it('rejects duplicate seasons and extra keys', () => {
    expect(schema.safeParse({ hosts: [{ season: 80, city: 'A', country: 'B' }, { season: 80, city: 'C', country: 'D' }] }).success).toBe(false);
    expect(schema.safeParse({ hosts: [], x: 1 }).success).toBe(false);
  });
});
