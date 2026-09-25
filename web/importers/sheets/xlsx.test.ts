import { describe, expect, it } from 'vitest';
import { cellText } from './xlsx';

describe('cellText', () => {
  it('stringifies plain values', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(84)).toBe('84');
    expect(cellText('  Boston Bucks ')).toBe('Boston Bucks');
  });
  it('unwraps rich text, formulas, and hyperlinks', () => {
    expect(cellText({ richText: [{ text: 'Free ' }, { text: 'Agency' }] })).toBe('Free Agency');
    expect(cellText({ formula: 'SUM(A1:A5)', result: 23 })).toBe('23');
    expect(cellText({ formula: 'SUM(A1:A5)' })).toBe('');
    expect(cellText({ text: 'link', hyperlink: 'http://x' })).toBe('link');
    expect(cellText({ error: '#REF!' })).toBe('');
  });
});
