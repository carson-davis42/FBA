import { describe, expect, it } from 'vitest';
import { Report } from './report';

describe('Report', () => {
  it('tracks errors', () => {
    const r = new Report();
    r.info('a', 'x');
    expect(r.hasErrors).toBe(false);
    r.error('b', 'y');
    expect(r.hasErrors).toBe(true);
    expect(r.count('error')).toBe(1);
  });
  it('renders grouped markdown', () => {
    const r = new Report();
    r.error('rosters', 'missing team');
    r.warn('logos', 'undated');
    r.info('logos', 'skipped');
    const md = r.toMarkdown('Import report');
    expect(md).toContain('# Import report');
    expect(md).toContain('Errors: 1 · Warnings: 1 · Info: 1');
    expect(md).toContain('## Errors\n\n### rosters\n\n- missing team');
    expect(md.indexOf('## Errors')).toBeLessThan(md.indexOf('## Warnings'));
  });
});
