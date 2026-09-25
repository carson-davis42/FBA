import { describe, expect, it } from 'vitest';
import { parseLogoFilename, resolveLogo } from './logos';
import type { LogoEntry } from './types';

describe('parseLogoFilename', () => {
  it('parses an open-ended era', () => {
    expect(parseLogoFilename('Atlanta Venom S75-pres..png')).toEqual({ file: 'Atlanta Venom S75-pres..png', from: 75, to: null, variant: 0 });
  });
  it('parses a closed era', () => {
    expect(parseLogoFilename('DCB S44-S78.png')).toMatchObject({ from: 44, to: 78 });
  });
  it('parses a single season', () => {
    expect(parseLogoFilename('Seattle Shock S77.png')).toMatchObject({ from: 77, to: 77 });
  });
  it('treats a name without an era as undated', () => {
    expect(parseLogoFilename('Texas Outlaws.png')).toMatchObject({ from: null, to: null, variant: 1 });
  });
  it('reads a trailing number as a variant', () => {
    expect(parseLogoFilename('Vegas Volts 5.png')).toMatchObject({ from: null, variant: 5 });
  });
  it('ignores non-png files', () => {
    expect(parseLogoFilename('Boston Bucks concept.webp')).toBeNull();
  });
});

const e = (file: string): LogoEntry => parseLogoFilename(file)!;

describe('resolveLogo', () => {
  const dcb = [e('DCB S1-S43.png'), e('DCB S44-S78.png'), e('DCB S79-pres..png')];
  it('picks the era covering the season', () => {
    expect(resolveLogo(dcb, 'DCB', 50)).toBe('DCB S44-S78.png');
    expect(resolveLogo(dcb, 'DCB', 79)).toBe('DCB S79-pres..png');
    expect(resolveLogo(dcb, 'DCB', 200)).toBe('DCB S79-pres..png');
  });
  it('falls back to the nearest era when none covers the season', () => {
    expect(resolveLogo([e('Philly Phantoms S80-pres..png')], 'Philly Phantoms', 79)).toBe('Philly Phantoms S80-pres..png');
  });
  it('prefers the highest-numbered undated variant', () => {
    const volts = [e('Vegas Volts 3.png'), e('Vegas Volts 5.png'), e('Vegas Volts 4.png')];
    expect(resolveLogo(volts, 'Vegas Volts', 79)).toBe('Vegas Volts 5.png');
  });
  it('breaks undated ties toward the folder name', () => {
    const orcas = [e('Vancouver Vikings.png'), e('Vancouver Orcas.png')];
    expect(resolveLogo(orcas, 'Vancouver Orcas', 79)).toBe('Vancouver Orcas.png');
  });
  it('returns null for an empty folder', () => {
    expect(resolveLogo([], 'X', 79)).toBeNull();
  });
});
