// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jcStateFixture } from '../../engine/jc/testFixtures';
import type { JcState } from '../../engine/jc/state';
import { LeadersPage } from './LeadersPage';

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
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(<MemoryRouter><LeadersPage /></MemoryRouter>);
}

/** Two games for C00T00 vs C01T00, plus one for C00T01 vs C00T02. Points are set per roster slot. */
function withGames(): JcState {
  const s = jcStateFixture();
  const box = (team: string, pts: number[]) => s.rosters.teams[team].map((r, i) => ({ playerId: r.playerId!, pts: pts[i] }));
  const g = (gameNo: number, home: string, away: string, hp: number[], ap: number[]) =>
    ({ gameNo, home, away, homePts: hp.reduce((a, b) => a + b), awayPts: ap.reduce((a, b) => a + b), box: { home: box(home, hp), away: box(away, ap) } });
  s.results!.games = [
    g(1, 'C00T00', 'C01T00', [30, 10, 10, 10, 10], [20, 20, 10, 5, 5]),
    g(2, 'C00T00', 'C01T00', [20, 10, 10, 10, 10], [10, 10, 10, 10, 10]),
    g(3, 'C00T01', 'C00T02', [40, 5, 5, 5, 5], [8, 8, 8, 8, 8]),
  ];
  return s;
}

const bodyRows = () => [...document.querySelectorAll('tbody tr')].map(r => r.textContent ?? '');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('LeadersPage', () => {
  it('sorts the national list by points per game', async () => {
    mount(withGames());
    await screen.findByRole('combobox');
    const rows = bodyRows();
    expect(rows[0]).toContain('C00T01 PG');
    expect(rows[0]).toContain('40.0');
    expect(rows[1]).toContain('C00T00 PG');
    expect(rows[1]).toContain('25.0');
  });

  it('shows unnamed players as X (ABBR)', async () => {
    const s = withGames();
    const id = s.rosters.teams["C00T01"][0].playerId!;
    s.players.players[id].name = null;
    mount(s);
    await screen.findByRole('combobox');
    expect(bodyRows()[0]).toContain('X (C00T01)');
  });

  it('the conference selector filters to that conference', async () => {
    mount(withGames());
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Conf 02' } });
    const rows = bodyRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.includes('C01T00'))).toBe(true);
    expect(rows[0]).toContain('15.0');
  });

  it('says so when no games have been played', async () => {
    mount(jcStateFixture());
    await screen.findByText(/No games yet/);
  });
});
