import { describe, expect, it } from 'vitest';
import { normalizeName } from './names';

describe('normalizeName', () => {
  it('ignores accents and case', () => {
    expect(normalizeName('Yasin Milovanović')).toBe(normalizeName('yasin milovanovic'));
  });
  it('collapses whitespace and keeps apostrophes', () => {
    expect(normalizeName("  Koa'e   Keano ")).toBe("koa'e keano");
  });
  it('treats punctuation as a space', () => {
    expect(normalizeName('Kenyon Rush Jr.')).toBe('kenyon rush jr');
  });
});
