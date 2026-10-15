import { describe, expect, it } from 'vitest';
import { lightAccent } from './teamColors';

describe('lightAccent', () => {
  it('uses the primary when it has colour', () => {
    expect(lightAccent({ primary: '#1A3C74', secondary: '#FFFFFF', ink: '#fff' })).toBe('#1A3C74');
  });
  it('falls back to the secondary when the primary is near white', () => {
    expect(lightAccent({ primary: '#F6F5F5', secondary: '#980201', ink: '#111' })).toBe('#980201');
    expect(lightAccent({ primary: '#FFFFFF', secondary: '#BD5704', ink: '#111' })).toBe('#BD5704');
  });
  it('keeps the primary when both colours are light', () => {
    expect(lightAccent({ primary: '#FFFFFF', secondary: '#F0F0F0', ink: '#111' })).toBe('#FFFFFF');
  });
});
