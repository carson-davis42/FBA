import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLogoManifest } from './logoManifest';
import { Report } from './report';

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'logos-'));
  mkdirSync(path.join(root, 'DCB', 'Concepts'), { recursive: true });
  writeFileSync(path.join(root, 'DCB', 'DCB S44-S78.png'), 'x');
  writeFileSync(path.join(root, 'DCB', 'DCB S79-pres..png'), 'x');
  writeFileSync(path.join(root, 'DCB', 'Concepts', 'DCB concept.png'), 'x');
  mkdirSync(path.join(root, 'Texas Outlaws'));
  writeFileSync(path.join(root, 'Texas Outlaws', 'Texas Outlaws.png'), 'x');
  writeFileSync(path.join(root, 'Texas Outlaws', 'notes.txt'), 'x');
  return root;
}

describe('buildLogoManifest', () => {
  it('lists png files per folder and skips subfolders', () => {
    const m = buildLogoManifest(fixture(), new Report());
    expect(m.folders['DCB'].map(e => e.file)).toEqual(['DCB S44-S78.png', 'DCB S79-pres..png']);
    expect(m.folders['Texas Outlaws'].map(e => e.file)).toEqual(['Texas Outlaws.png']);
  });
  it('warns about undated logos', () => {
    const report = new Report();
    buildLogoManifest(fixture(), report);
    expect(report.entries.some(x => x.level === 'warn' && x.message.includes('Texas Outlaws/Texas Outlaws.png'))).toBe(true);
  });
});
