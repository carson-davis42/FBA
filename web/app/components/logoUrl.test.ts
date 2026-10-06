import { describe, expect, it } from 'vitest';
import { LOGO_URL_VERSION, logoUrl } from './logoUrl';

describe('logoUrl', () => {
  it('names the folder and season, encoded, and carries the cache version', () => {
    expect(logoUrl('San Antonio', 57)).toBe(`/logos/San%20Antonio/57?v=${LOGO_URL_VERSION}`);
  });
  it('names the wanted file for a shared folder, encoded, ahead of the version', () => {
    expect(logoUrl('FBAD2', 79, 'Mumbai BC S79-pres..png')).toBe(`/logos/FBAD2/79?file=Mumbai%20BC%20S79-pres..png&v=${LOGO_URL_VERSION}`);
    expect(logoUrl('FBAJC_Final', 78, 'Texas A&M.png')).toContain('file=Texas%20A%26M.png&v=');
  });
  it('treats a missing or empty file as no file', () => {
    expect(logoUrl('DCB', 79, null)).toBe(logoUrl('DCB', 79));
    expect(logoUrl('DCB', 79, '')).toBe(logoUrl('DCB', 79));
  });
});
