// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { D2DraftHistoryFile, D2LeagueHistoryFile, PlayersFile, SummaryFile, TeamsFile } from '../../../engine/shared/types';
import { D2SeasonPage } from './D2SeasonPage';
import { D2TeamPage } from './D2TeamPage';
import { D2TeamsPage } from './D2TeamsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = {
  nextId: 3,
  players: {
    p00001: { id: 'p00001', name: 'Cameron Lučić', birthSeason: 40 },
    p00002: { id: 'p00002', name: 'Ray Allen', birthSeason: 41 },
  },
};
const team = (teamId: string, name: string, group: string) => ({ teamId, name, abbr: teamId, group, logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } });
const teams: TeamsFile = { league: 'fbad2', teams: [{ ...team('LIS', 'Atlético Lisboa', 'PL'), city: 'Lisbon', country: 'Portugal' }, team('ROM', 'Roma Pallacanestro', 'PL'), team('OSL', 'Oslo', 'UL'), team('BER', 'Bern', 'WL')] };

const s69: SummaryFile = {
  league: 'fbad2', season: 69, locked: true, host: null,
  champions: [{ title: 'Premier League Champion', champion: 'Atlético Lisboa', runnerUp: 'Roma Pallacanestro', score: '4-2', group: 'PL', finalsMvp: 'p00002' }],
  awards: [{ award: 'MVP-PL', playerId: 'p00002', teamId: 'LIS' }],
  rsChampions: [{ group: 'PL', teams: ['Roma Pallacanestro'] }],
};
const row = (teamId: string, name: string, rank: number, w: number, l: number) => ({ teamId, name, group: 'PL', rank, w, l, confW: null, confL: null, diff: null, marker: null, seed: null, playoff: null });
const s80: SummaryFile = {
  league: 'fbad2', season: 80, locked: true, host: null, champions: [],
  standings: [row('ROM', 'Roma Pallacanestro', 2, 10, 20), row('LIS', 'Atlético Lisboa', 1, 20, 10)],
  promotion: [{ league: 'PL', promoted: [], relegated: ['LIS'] }],
};
const history: D2LeagueHistoryFile = {
  teams: [{ teamId: 'LIS', founded: 56, spells: [{ group: 'ES', from: 56, to: 67 }, { group: 'PL', from: 68, to: null }] }],
};
const drafts: D2DraftHistoryFile = {
  drafts: [{ season: 70, picks: [{ pick: 1, teamId: 'LIS', teamName: 'Atlético Lisboa', name: 'Ray Allen', playerId: 'p00002', pos: 'G', age: 19, rating: null }] }],
};

function stub(opts: { withHistory?: boolean } = {}) {
  const docs: Record<string, unknown> = {
    '/api/state/players.json': players,
    '/api/state/leagues/fbad2/teams.json': teams,
    '/api/state/leagues/fbad2/leagueHistory.json': history,
    '/api/state/leagues/fbad2/draftHistory.json': drafts,
    '/api/state/meta.json': { currentSeason: 79 },
  };
  if (opts.withHistory === false) delete docs['/api/state/leagues/fbad2/leagueHistory.json'];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fbad2') return new Response(JSON.stringify({ seasons: [s69, s80], errors: [] }));
    if (url in docs) return new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } });
    return new Response('{}', { status: 404 });
  }));
}
const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/history/fbad2/season/:season" element={<D2SeasonPage />} />
      <Route path="/history/fbad2/teams" element={<D2TeamsPage />} />
      <Route path="/history/fbad2/teams/:teamId" element={<D2TeamPage />} />
    </Routes>
  </MemoryRouter>,
);

describe('D2 season, teams and team pages', () => {
  it('an imported season shows titles, regular-season champions and MVPs, and the select navigates', async () => {
    stub();
    at('/history/fbad2/season/69');
    expect(await screen.findByRole('heading', { name: 'S69 D2 season' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Titles' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Regular-season champions' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'MVPs' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Standings' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '80' } });
    expect(await screen.findByRole('heading', { name: 'S80 D2 season' })).toBeTruthy();
  });

  it('an app-played season shows standings and the promotion line', async () => {
    stub();
    at('/history/fbad2/season/80');
    expect(await screen.findByRole('heading', { name: 'Standings' })).toBeTruthy();
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('Atlético Lisboa');
    expect(screen.getByRole('heading', { name: 'Promotion and relegation' })).toBeTruthy();
    expect(screen.getByText(/Premier League: promoted .* relegated/).textContent).toContain('relegated Atlético Lisboa');
  });

  it('an unknown season is not found', async () => {
    stub();
    at('/history/fbad2/season/5');
    expect(await screen.findByText('Not found')).toBeTruthy();
  });

  it('the teams page groups teams and counts titles', async () => {
    stub();
    at('/history/fbad2/teams');
    for (const g of ['Premier League', 'World League', 'United League', 'International League']) expect(await screen.findByRole('heading', { name: g })).toBeTruthy();
    const card = (await screen.findAllByRole('link')).find(l => l.getAttribute('href') === '/history/fbad2/teams/LIS') as HTMLElement;
    expect(card.textContent).toContain('1 title');
    expect(card.textContent).not.toContain('1 titles');
  });

  it('a team page shows the league path, titles and draft picks', async () => {
    stub();
    at('/history/fbad2/teams/LIS');
    expect(await screen.findByRole('heading', { name: 'Atlético Lisboa' })).toBeTruthy();
    expect(await screen.findByText('Euro-South S56–S67')).toBeTruthy();
    expect(screen.getByText('Premier League S68–pres.')).toBeTruthy();
    expect(screen.getByText('Lisbon, Portugal')).toBeTruthy();
    const titlesList = screen.getAllByRole('heading', { name: 'Titles' })[0].parentElement as HTMLElement;
    expect(within(titlesList).getByText('S69 Premier League Champion')).toBeTruthy();
    const pick = screen.getByRole('heading', { name: 'Draft picks' }).parentElement as HTMLElement;
    expect(within(pick).getByRole('link', { name: 'S70' }).getAttribute('href')).toBe('/history/fbad2/drafts/70');
  });

  it('a team page hints at the import when there is no league history', async () => {
    stub({ withHistory: false });
    at('/history/fbad2/teams/LIS');
    expect(await screen.findByText(/No D2 league history yet/)).toBeTruthy();
  });

  it('the season page links to the previous and next seasons', async () => {
    stub();
    at('/history/fbad2/season/69');
    expect((await screen.findByRole('link', { name: /S80/ })).getAttribute('href')).toBe('/history/fbad2/season/80');
    expect(screen.queryByRole('link', { name: /← S/ })).toBeNull();
  });

  it('an unknown team is not found', async () => {
    stub();
    at('/history/fbad2/teams/NOPE');
    expect(await screen.findByText('Not found')).toBeTruthy();
  });
});
