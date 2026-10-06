import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLogoManifest, diffLogoManifests } from './logoManifest';
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

describe('buildLogoManifest with the main league under FBA_Main', () => {
  function layout(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'logos-main-'));
    mkdirSync(path.join(root, 'FBA_Main', 'DCB', 'Concepts'), { recursive: true });
    writeFileSync(path.join(root, 'FBA_Main', 'DCB', 'DCB S44-S78.png'), 'x');
    writeFileSync(path.join(root, 'FBA_Main', 'DCB', 'Concepts', 'DCB concept.png'), 'x');
    mkdirSync(path.join(root, 'FBA_Main', 'Boston Bucks'));
    writeFileSync(path.join(root, 'FBA_Main', 'Boston Bucks', 'Boston Bucks S61-pres..png'), 'x');
    mkdirSync(path.join(root, 'FBAJC_Final'));
    writeFileSync(path.join(root, 'FBAJC_Final', 'Duke.png'), 'x');
    mkdirSync(path.join(root, 'FBA'));
    writeFileSync(path.join(root, 'FBA', 'FBA_logo.png'), 'x');
    return root;
  }
  it('lists each team folder in FBA_Main as its own folder, beside the top-level shared ones, without FBA_Main itself', () => {
    const m = buildLogoManifest(layout(), new Report());
    expect(Object.keys(m.folders).sort()).toEqual(['Boston Bucks', 'DCB', 'FBA', 'FBAJC_Final']);
    expect(m.folders['DCB'].map(e => e.file)).toEqual(['DCB S44-S78.png']);
    expect(m.folders['Boston Bucks'][0]).toMatchObject({ from: 61, to: null });
  });
  it('keeps the folders in name order, ignoring case, wherever they sit on disk, so the stored manifest stays stable', () => {
    expect(Object.keys(buildLogoManifest(layout(), new Report()).folders)).toEqual(['Boston Bucks', 'DCB', 'FBA', 'FBAJC_Final']);
  });
});

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

describe('diffLogoManifests', () => {
  const entry = (file: string) => ({ file, from: null, to: null, variant: 1 });
  it('lists added, removed and changed folders', () => {
    const before = { folders: { Same: [entry('a.png')], Renamed: [entry('Old.png')], Gone: [entry('g.png')] } };
    const after = { folders: { Same: [entry('a.png')], Renamed: [entry('New S79-pres..png')], Fresh: [entry('f.png')] } };
    expect(diffLogoManifests(before, after)).toEqual({ added: ['Fresh'], removed: ['Gone'], changed: ['Renamed'] });
  });
  it('treats a missing stored manifest as every folder added', () => {
    expect(diffLogoManifests(null, { folders: { B: [], A: [] } })).toEqual({ added: ['A', 'B'], removed: [], changed: [] });
  });
});
