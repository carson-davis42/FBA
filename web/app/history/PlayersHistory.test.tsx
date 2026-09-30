// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AwardCountsFile, PlayerBiosFile, PlayersFile, SummaryFile, SummaryPlayerLine } from '../../engine/shared/types';
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

const naylorBio: PlayerBiosFile = {
  league: 'fba',
  bios: [{
    playerId: 'p00001', born: 'Born-S51',
    entries: ['Wake Forest - S63', 'BOS - S64-S68', '3x All-Star', 'S67 MIP', 'DEN - S69-S70', 'SEA - S71-pres.', '1x MVP', 'Retired after S75', 'HOF-S77'],
  }],
};
const baseline: AwardCountsFile = { league: 'fba', throughSeason: 78, counts: [{ playerId: 'p00001', key: 'MVP', count: 2 }, { playerId: 'p00001', key: 'ALL_STAR', count: 3 }] };
const s78: SummaryFile = {
  league: 'fba', season: 78, locked: true, host: null, champions: [],
  legacyPpg: [{ playerId: 'p00001', teamId: 'SEA', ppg: 24.5 }],
};
const s79: SummaryFile = {
  league: 'fba', season: 79, locked: true, host: null, champions: [],
  awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'SEA' }],
  players: [line('SEA', 1, [50, 1000], [10, 300])],
};

function stub(opts: { bios?: PlayerBiosFile | null; seasons?: SummaryFile[]; counts?: AwardCountsFile } = {}) {
  const b = 'bios' in opts ? opts.bios : bios;
  const seasons = opts.seasons ?? [s72, s71];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fba') return new Response(JSON.stringify({ seasons, errors: [] }));
    const docs: Record<string, unknown> = { '/api/state/players.json': players };
    if (b) docs['/api/state/leagues/fba/playerBios.json'] = b;
    if (opts.counts) docs['/api/state/leagues/fba/awardCounts.json'] = opts.counts;
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
    expect(screen.getByText('1 player')).toBeTruthy();
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
  it('shows the born line, honours in season order and an empty seasons table for pre-S79 lines', async () => {
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
    expect(screen.queryByText('Seasons')).toBeNull();
  });

  it('renders the Career block: college line, three FBA rows, other lines and the Hall of Fame class', async () => {
    stub({ bios: naylorBio });
    renderAt('/history/fba/players/p00001');
    expect(await screen.findByText('College: Wake Forest (S63)')).toBeTruthy();
    const rows = screen.getAllByRole('row').map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent)).filter(r => r.length > 0);
    expect(rows).toEqual([
      ['FBA', 'BOS', 'S64-S68', '3x All-Star, S67 MIP'],
      ['FBA', 'DEN', 'S69-S70', ''],
      ['FBA', 'SEA', 'S71-pres.', '1x MVP'],
    ]);
    expect(screen.getByText('Retired after S75')).toBeTruthy();
    expect(screen.getByText('Hall of Fame: S77')).toBeTruthy();
  });

  it('builds award chips from the baseline plus the S79 summary', async () => {
    stub({ bios: naylorBio, counts: baseline, seasons: [s79, s78] });
    renderAt('/history/fba/players/p00001');
    expect(await screen.findByText('3× MVP')).toBeTruthy();
    expect(screen.getByText('3× ASG')).toBeTruthy();
  });

  it('shows the S78 PPG row with dashes and a Career (since S79) total row', async () => {
    stub({ bios: naylorBio, counts: baseline, seasons: [s79, s78] });
    renderAt('/history/fba/players/p00001');
    expect(await screen.findByText('Career (since S79)')).toBeTruthy();
    const rows = screen.getAllByRole('row').map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent)).filter(r => r.length > 0);
    expect(rows.slice(-3)).toEqual([
      ['S78', 'SEA', '—', '—', '24.5', '—', '—', '—'],
      ['S79', 'SEA', '50', '1000', '20.0', '10', '300', '30.0'],
      ['Career (since S79)', '', '50', '1000', '20.0', '', '', ''],
    ]);
  });

  it('renders without awardCounts.json', async () => {
    stub({ bios: naylorBio, seasons: [s79, s78] });
    renderAt('/history/fba/players/p00001');
    expect(await screen.findByText('1× MVP')).toBeTruthy();
    expect(screen.getByText('Hall of Fame: S77')).toBeTruthy();
  });

  it('shows a real bio value without the Born- prefix', async () => {
    stub({ bios: { league: 'fba', bios: [{ playerId: 'p00001', born: 'Born-S51', entries: [] }, { playerId: 'p00002', born: 'Born-FFL S1(-53)', entries: [] }] } });
    renderAt('/history/fba/players/p00001');
    expect(await screen.findByText('Born: S51')).toBeTruthy();
    cleanup();
    renderAt('/history/fba/players/p00002');
    expect(await screen.findByText('Born: FFL S1(-53)')).toBeTruthy();
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
