import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const REAL = path.join(WEB, 'data');
const dirs: string[] = [];

function run(dir: string) {
  return spawnSync('npx', ['tsx', 'importers/run.ts', '--wc-qualifying-step', '--data', dir], { cwd: WEB, encoding: 'utf8', shell: true });
}
function scratch(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wcq-'));
  dirs.push(dir);
  expect(path.resolve(dir).startsWith(path.resolve(REAL))).toBe(false);
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('--wc-qualifying-step', () => {
  it('adds s79-qualifying before retirement, leaves other steps, and is idempotent', () => {
    const dir = scratch();
    copyFileSync(path.join(REAL, 'calendar.json'), path.join(dir, 'calendar.json'));
    const before = JSON.parse(readFileSync(path.join(dir, 'calendar.json'), 'utf8'));
    const first = run(dir);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('Added s79-qualifying');
    const raw = readFileSync(path.join(dir, 'calendar.json'), 'utf8');
    const after = JSON.parse(raw);
    const ids = after.steps.map((s: { id: string }) => s.id);
    expect(ids.indexOf('s79-qualifying')).toBe(ids.indexOf('retirement') - 1);
    expect(after.steps.filter((s: { id: string }) => s.id !== 's79-qualifying')).toEqual(before.steps);
    const second = run(dir);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('Already has the qualifying step');
    expect(readFileSync(path.join(dir, 'calendar.json'), 'utf8')).toBe(raw);
  });

  it('exits non-zero when the data dir has no calendar.json', () => {
    const r = run(scratch());
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('calendar.json');
  });
});
