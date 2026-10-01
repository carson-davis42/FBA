// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jcStateFixture, jcUnstartedFixture } from '../../engine/jc/testFixtures';
import type { JcState } from '../../engine/jc/state';
import { RankingsPage } from './RankingsPage';

function mount(s: JcState) {
  const p = `leagues/fbajc/S${s.season}`;
  const docs: Record<string, unknown> = {
    'calendar.json': s.calendar,
    'players.json': s.players,
    'leagues/fbajc/teams.json': s.teams,
    [`${p}/rosters.json`]: s.rosters,
  };
  if (s.schedule) docs[`${p}/schedule.json`] = s.schedule;
  if (s.results) docs[`${p}/results.json`] = s.results;
  if (s.rankings) docs[`${p}/rankings.json`] = s.rankings;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(<MemoryRouter><RankingsPage /></MemoryRouter>);
}

function withSnaps(): { s: JcState; pre: string[]; after1: string[] } {
  const s = jcStateFixture();
  const pre = s.teams.teams.map(t => t.teamId);
  // swap #1 and #2, move #25 out and #30 in at the last spot of the top 25
  const after1 = [...pre];
  [after1[0], after1[1]] = [after1[1], after1[0]];
  [after1[24], after1[29]] = [after1[29], after1[24]];
  s.rankings = { league: 'fbajc', season: s.season, locked: false, snapshots: [{ afterDay: 0, order: pre }, { afterDay: 1, order: after1 }] };
  return { s, pre, after1 };
}

const bodyRows = () => [...document.querySelectorAll('tbody tr')].map(r => r.textContent ?? '');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('RankingsPage', () => {
  it('shows the latest snapshot top 25 with change labels', async () => {
    const { s } = withSnaps();
    mount(s);
    await screen.findByRole('combobox');
    const rows = bodyRows();
    expect(rows.length).toBe(25);
    expect(rows[0]).toContain('C00T01');
    expect(rows[0]).toContain('+1');
    expect(rows[1]).toContain('C00T00');
    expect(rows[1]).toContain('-1');
    expect(rows[2]).toContain('--');
    expect(rows[24]).toContain('NR');
    expect(rows[24]).toContain('C02T05');
  });

  it('lists the teams that dropped out', async () => {
    const { s } = withSnaps();
    mount(s);
    await screen.findByRole('combobox');
    const line = screen.getByText(/Dropped out/);
    expect(line.textContent).toContain('C02T00 U');
  });

  it('Show all 216 lists the full order', async () => {
    const { s } = withSnaps();
    mount(s);
    await screen.findByRole('combobox');
    fireEvent.click(screen.getByLabelText('Show all 216'));
    expect(bodyRows().length).toBe(216);
  });

  it('the preseason snapshot has -- in every change cell and no dropped line', async () => {
    const { s } = withSnaps();
    mount(s);
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '0' } });
    const cells = [...document.querySelectorAll('tbody td.rk-change')].map(c => c.textContent);
    expect(cells.length).toBe(25);
    expect(cells.every(c => c === '--')).toBe(true);
    expect(screen.queryByText(/Dropped out/)).toBeNull();
    expect(screen.getByRole('option', { name: 'Preseason' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'After day 1' })).toBeTruthy();
  });

  it('says so when there are no rankings yet', async () => {
    mount(jcUnstartedFixture());
    expect(await screen.findByText('No rankings yet')).toBeTruthy();
  });
});
