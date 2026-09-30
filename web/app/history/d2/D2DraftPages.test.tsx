// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { D2DraftHistoryFile, PlayersFile, SummaryFile, TeamsFile } from '../../../engine/shared/types';
import { PlayerHistoryPage } from '../PlayerHistoryPage';
import { D2DraftSeasonPage } from './D2DraftSeasonPage';
import { D2DraftsPage } from './D2DraftsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = {
  nextId: 3,
  players: {
    p00001: { id: 'p00001', name: 'Cameron Lučić', birthSeason: 40 },
    p00002: { id: 'p00002', name: 'Ray Allen', birthSeason: 41 },
  },
};
const team = (teamId: string, name: string, group: string) => ({ teamId, name, abbr: teamId, group, logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } });
const teams: TeamsFile = { league: 'fbad2', teams: [team('LIS', 'Lisbon', 'PL'), team('ROM', 'Rome', 'PL')] };
const drafts: D2DraftHistoryFile = {
  drafts: [
    {
      season: 68,
      picks: [{ pick: 1, teamId: 'ROM', teamName: 'Rome', name: 'Old Timer', playerId: null, pos: 'C', age: 20, rating: null }],
    },
    {
      season: 70,
      picks: [
        { pick: 1, teamId: 'LIS', teamName: 'Lisbon', name: 'Ray Allen', playerId: 'p00002', pos: 'G', age: 19, rating: 88 },
        { pick: 2, teamId: null, teamName: 'Vancouver', name: 'Bob Unlinked', playerId: null, pos: 'F', age: null, rating: null },
      ],
    },
  ],
};
const s69: SummaryFile = {
  league: 'fbad2', season: 69, locked: true, host: null,
  champions: [{ title: 'Premier League Champion', champion: 'Lisbon', runnerUp: 'Rome', score: '4-2', group: 'PL', finalsMvp: 'p00002' }],
  awards: [{ award: 'MVP-PL', playerId: 'p00002', teamId: 'LIS' }],
};

function stub(opts: { withDrafts?: boolean } = {}) {
  const docs: Record<string, unknown> = {
    '/api/state/players.json': players,
    '/api/state/leagues/fbad2/teams.json': teams,
  };
  if (opts.withDrafts !== false) docs['/api/state/leagues/fbad2/draftHistory.json'] = drafts;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fba') return new Response(JSON.stringify({ seasons: [], errors: [] }));
    if (url === '/api/history/fbad2') return new Response(JSON.stringify({ seasons: [s69], errors: [] }));
    if (url in docs) return new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } });
    return new Response('{}', { status: 404 });
  }));
}
const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/history/fbad2/drafts" element={<D2DraftsPage />} />
      <Route path="/history/fbad2/drafts/:season" element={<D2DraftSeasonPage />} />
      <Route path="/history/fba/players/:playerId" element={<PlayerHistoryPage />} />
    </Routes>
  </MemoryRouter>,
);

describe('D2 draft pages', () => {
  it('lists the draft seasons newest first', async () => {
    stub();
    at('/history/fbad2/drafts');
    expect(await screen.findByRole('heading', { name: 'Drafts' })).toBeTruthy();
    const chips = (await screen.findAllByRole('link', { name: /^S\d+$/ })).map(a => a.textContent);
    expect(chips).toEqual(['S70', 'S68']);
  });

  it('says so when there is no draft history', async () => {
    stub({ withDrafts: false });
    at('/history/fbad2/drafts');
    expect(await screen.findByText(/No D2 draft history yet/)).toBeTruthy();
  });

  it('a season shows its picks, team links, dashes and the prev link', async () => {
    stub();
    at('/history/fbad2/drafts/70');
    expect(await screen.findByRole('heading', { name: 'S70 D2 Draft' })).toBeTruthy();
    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('Lisbon');
    expect(rows[1].textContent).toContain('Ray Allen');
    expect(rows[2].textContent).toContain('Vancouver');
    expect(rows[2].textContent).toContain('Bob Unlinked');
    expect(rows[2].textContent).toContain('—');
    expect(screen.getByRole('link', { name: /Lisbon/ }).getAttribute('href')).toBe('/history/fbad2/teams/LIS');
    expect(screen.queryByRole('link', { name: 'Vancouver' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Ray Allen' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /S68/ }).getAttribute('href')).toBe('/history/fbad2/drafts/68');
    expect(screen.queryByRole('link', { name: /S71/ })).toBeNull();
  });

  it('an unknown season is not found', async () => {
    stub();
    at('/history/fbad2/drafts/5');
    expect(await screen.findByText('Not found')).toBeTruthy();
  });
});

describe('PlayerHistoryPage D2 honours', () => {
  it('shows a D2-only player their D2 honours and not the empty line', async () => {
    stub();
    at('/history/fba/players/p00002');
    expect(await screen.findByRole('heading', { name: 'D2 honours' })).toBeTruthy();
    expect(screen.getByText('S69: Premier League MVP (Lisbon)')).toBeTruthy();
    expect(screen.getByText('S69: Series MVP, Premier League Champion')).toBeTruthy();
    expect(screen.queryByText('No history recorded')).toBeNull();
  });
});
