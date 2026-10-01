// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jcStateFixture, jcUnstartedFixture } from '../../engine/jc/testFixtures';
import type { JcState } from '../../engine/jc/state';
import type { GameResult } from '../../engine/shared/types';
import { StandingsPage } from './StandingsPage';

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
  if (s.postseason) docs[`${p}/postseason.json`] = s.postseason;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(<MemoryRouter><StandingsPage /></MemoryRouter>);
}

const game = (gameNo: number, home: string, away: string, homePts: number, awayPts: number): GameResult => ({ gameNo, home, away, homePts, awayPts });

/** C00T00 sweeps its conference twice (22-0), so it has clinched the title. */
function sweep(s: JcState): void {
  const games: GameResult[] = [];
  let n = 1;
  for (let t = 1; t < 12; t++) {
    const other = `C00T${String(t).padStart(2, '0')}`;
    games.push(game(n++, 'C00T00', other, 80, 60), game(n++, other, 'C00T00', 60, 80));
  }
  s.results = { ...s.results!, games };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('StandingsPage', () => {
  it('shows 12 rows for the default conference, sorted by conference record', async () => {
    const s = jcStateFixture();
    sweep(s);
    mount(s);
    await screen.findByRole('combobox');
    expect(document.querySelectorAll('table').length).toBe(1);
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(12);
    expect(rows[0].textContent).toContain('C00T00');
    expect(rows[0].textContent).toContain('22-0');
  });

  it('a clinched leader has the champion bar and a legend entry', async () => {
    const s = jcStateFixture();
    sweep(s);
    mount(s);
    await screen.findByRole('combobox');
    expect(document.querySelectorAll('td.clinch-champion').length).toBe(1);
    expect(screen.getByText('Clinched conference title')).toBeTruthy();
  });

  it('after the fields are set, March Madness and NIT teams show bid bars and the key says so', async () => {
    const s = jcStateFixture();
    sweep(s);
    s.postseason = { field: { mm: { teams: ['C00T05'] }, nit: { teams: ['C00T06'] } } } as unknown as JcState['postseason'];
    mount(s);
    await screen.findByRole('combobox');
    expect(document.querySelectorAll('td.clinch-marchmadness').length).toBe(1);
    expect(document.querySelectorAll('td.clinch-nit').length).toBe(1);
    expect(screen.getByText('March Madness bid')).toBeTruthy();
    expect(screen.getByText('NIT bid')).toBeTruthy();
    expect(document.querySelectorAll('td.clinch-champion').length).toBe(1);
  });

  it('All conferences shows 18 tables', async () => {
    mount(jcStateFixture());
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'all' } });
    expect(document.querySelectorAll('table').length).toBe(18);
  });

  it('shows a tie note for a random draw', async () => {
    const s = jcStateFixture();
    s.results = { ...s.results!, games: [game(1, 'C00T00', 'C00T02', 70, 60), game(2, 'C00T01', 'C00T03', 70, 60)] };
    mount(s);
    await screen.findByRole('combobox');
    expect(screen.getAllByText(/random draw/).length).toBeGreaterThan(0);
  });

  it('before the season starts shows No games yet with the teams alphabetically', async () => {
    mount(jcUnstartedFixture());
    expect(await screen.findByText('No games yet')).toBeTruthy();
    const rows = [...document.querySelectorAll('tbody tr')].map(r => r.textContent ?? '');
    expect(rows.length).toBe(12);
    const sorted = [...rows].sort((a, b) => a.localeCompare(b));
    expect(rows).toEqual(sorted);
  });

  it('before the schedule exists the title is neutral', async () => {
    mount(jcUnstartedFixture());
    await screen.findByText('No games yet');
    expect(screen.queryByText(/S79 FBAJC/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Standings' })).toBeTruthy();
  });
});
