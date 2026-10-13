import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { calendarFor } from '../engine/shared/calendar';
import { withSeasonStart } from './seasonStart';

const WEB = path.resolve(__dirname, '..');
const REAL = path.join(WEB, 'data');
const dirs: string[] = [];

function run(dir: string, ...args: string[]) {
  return spawnSync('npx', ['tsx', 'importers/run.ts', '--season-start', ...args, '--data', dir], { cwd: WEB, encoding: 'utf8', shell: process.platform === 'win32' });
}
function scratch(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sstart-'));
  dirs.push(dir);
  expect(path.resolve(dir).startsWith(path.resolve(REAL))).toBe(false);
  writeFileSync(path.join(dir, 'calendar.json'), JSON.stringify(calendarFor(79), null, 2));
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('withSeasonStart', () => {
  it('sets startedAt on the matching season and keeps the steps', () => {
    const r = withSeasonStart(calendarFor(79), 79, '2026-10-01T18:30:00Z');
    expect(r.ok && r.calendar.startedAt).toBe('2026-10-01T18:30:00Z');
    expect(r.ok && r.calendar.steps).toEqual(calendarFor(79).steps);
  });
  it('refuses another season and an invalid date', () => {
    expect(withSeasonStart(calendarFor(79), 80, '2026-10-01T18:30:00Z').ok).toBe(false);
    expect(withSeasonStart(calendarFor(79), 79, 'yesterday').ok).toBe(false);
    expect(withSeasonStart(calendarFor(79), 79, '2026-13-45T00:00:00Z').ok).toBe(false);
  });
});

describe('--season-start', () => {
  it('writes startedAt into calendar.json of the scratch folder', () => {
    const dir = scratch();
    const r = run(dir, '79', '2026-10-01T18:30:00Z');
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, 'calendar.json'), 'utf8')).startedAt).toBe('2026-10-01T18:30:00Z');
  });
  it('exits non-zero and writes nothing for another season or a bad date', () => {
    const dir = scratch();
    const before = readFileSync(path.join(dir, 'calendar.json'), 'utf8');
    expect(run(dir, '80', '2026-10-01T18:30:00Z').status).not.toBe(0);
    expect(run(dir, '79', 'nonsense').status).not.toBe(0);
    expect(readFileSync(path.join(dir, 'calendar.json'), 'utf8')).toBe(before);
  });
});
