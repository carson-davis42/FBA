// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerBiosFile, PlayersFile, SummaryFile, SummaryPlayerLine } from '../../engine/shared/types';
import { PlayerHistoryPage } from './PlayerHistoryPage';
import { PlayersHistoryPage } from './PlayersHistoryPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = {
  nextId: 4,
  players: {
    p00001: { id: 'p00001', name: 'Cameron Lučić', birthSeason: 40 },
    p00002: { id: 'p00002', name: 'Ray Allen', birthSeason: 41 },
    p00003: { id: 'p00003', name: 'Sam Nobody', birthSeason: 42 },
  },
};

const bios: PlayerBiosFile = {
  league: 'fba',
  bios: [{ playerId: 'p00001', born: 'March 3, 2040', entries: ['Drafted 3rd overall by Boston in S60', 'Retired after S75'] }],
};

const totals = (g: number, pts: number) => ({ g, pts, def: 0, stops: 0, allowed: 0, exp: 0 });
const line = (teamId: string | null, stint: number | null, rs: number[], po: number[] | null): SummaryPlayerLine => ({
  playerId: 'p00001', teamId, stint, position: 'SF', ratingStart: 70, ratingEnd: 72,
  rs: totals(rs[0], rs[1]), po: po ? totals(po[0], po[1]) : null,
});

const s71: SummaryFile = {
  league: 'fba', season: 71, locked: true, host: null,
  champions: [{ title: 'FBA Champion', champion: 'Utah', runnerUp: 'Boston', score: '4-1', finalsMvp: 'p00002' }],
  awards: [{ award: 'ROTY', playerId: 'p00001', teamId: 'BOS' }],
  players: [line('BOS', 1, [40, 800], [10, 250]), line('UTA', 2, [20, 300], null), line(null, null, [60, 1100], [10, 250])],
};
const s72: SummaryFile = {
  league: 'fba', season: 72, locked: true, host: null,
  champions: [{ title: 'FBA Champion', champion: 'Boston', runnerUp: 'Utah', score: '4-3', finalsMvp: 'p00001' }],
  awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'BOS' }],
  allStar: { allStars: ['p00001'], youngStars: [], asgWinner: null, asgLoser: null, asgMvp: 'p00001', ysgWinner: null, ysgMvp: null, fivePoint: null, dunk: null },
};

function stub(opts: { bios?: PlayerBiosFile | null; seasons?: SummaryFile[] } = {}) {
  const b = 'bios' in opts ? opts.bios : bios;
  const seasons = opts.seasons ?? [s72, s71];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fba') return new Response(JSON.stringify({ seasons, errors: [] }));
    const docs: Record<string, unknown> = { '/api/state/players.json': players };
    if (b) docs['/api/state/leagues/fba/playerBios.json'] = b;
    if (url in docs) return new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } });
    return new Response('{}', { status: 404 });
  }));
}

function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/history/fba/players" element={<PlayersHistoryPage />} />
        <Route path="/history/fba/players/:playerId" element={<PlayerHistoryPage />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

describe('PlayersHistoryPage', () => {
  it('lists the index, filters by a normalised search, and links to the player page', async () => {
    stub();
    renderAt('/history/fba/players');
    expect(await screen.findByRole('heading', { name: 'FBA Players' })).toBeTruthy();
    expect(await screen.findByText('2 players')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ray Allen' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'lucic' } });
    expect(screen.getByText('1 players')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Ray Allen' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Cameron Lučić' }));
    expect(screen.getByTestId('where').textContent).toBe('/history/fba/players/p00001');
  });

  it('still lists players when playerBios.json is missing', async () => {
    stub({ bios: null });
    renderAt('/history/fba/players');
    expect(await screen.findByText('2 players')).toBeTruthy();
  });
});

describe('PlayerHistoryPage', () => {
  it('shows the bio entries, honours in season order and a stat table with a Total row', async () => {
    stub();
    renderAt('/history/fba/players/p00001');
    expect(await screen.findByRole('heading', { name: 'Cameron Lučić' })).toBeTruthy();
    expect(screen.getByText('Born: March 3, 2040')).toBeTruthy();
    const entries = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(entries.slice(0, 2)).toEqual(['Drafted 3rd overall by Boston in S60', 'Retired after S75']);
    const i71 = entries.indexOf('S71: ROTY');
    const i72 = entries.indexOf('S72: Finals MVP, MVP, All-Star, All-Star Game MVP');
    expect(i71).toBeGreaterThan(1);
    expect(i72).toBeGreaterThan(i71);
    const rows = screen.getAllByRole('row').map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent));
    expect(rows.filter(r => r.length > 0)).toEqual([
      ['S71', 'BOS', '40', '800', '20.0', '10', '250', '25.0'],
      ['S71', 'UTA', '20', '300', '15.0', '—', '—', '—'],
      ['S71', 'Total', '60', '1100', '18.3', '10', '250', '25.0'],
    ]);
  });

  it('shows Not found for an unknown id', async () => {
    stub();
    renderAt('/history/fba/players/p09999');
    expect(await screen.findByText('Not found')).toBeTruthy();
  });

  it('renders the name and No history recorded for a player with nothing, and without a bios doc', async () => {
    stub({ bios: null });
    renderAt('/history/fba/players/p00003');
    expect(await screen.findByRole('heading', { name: 'Sam Nobody' })).toBeTruthy();
    expect(screen.getByText('No history recorded')).toBeTruthy();
  });

  it('renders the page with a missing bios doc for a player with honours', async () => {
    stub({ bios: null });
    renderAt('/history/fba/players/p00001');
    const h = await screen.findByRole('heading', { name: 'Cameron Lučić' });
    expect(within(h.parentElement as HTMLElement).queryByText(/^Born:/)).toBeNull();
    expect(screen.getByText('S71: ROTY')).toBeTruthy();
  });
});
