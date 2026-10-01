// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RosterTable } from '../components/RosterTable';
import { LeaguePage } from './LeaguePage';
import { TeamPage } from './TeamPage';

const badge = { bg: 'hsl(10 55% 36%)', fg: '#ffffff' };
const entry = (playerId: string | null, position: 'PG' | 'SG' | 'SF', rating: number | null) => ({ playerId, position, rating, age: rating === null ? null : 25, points: 0 });
const docs: Record<string, unknown> = {
  'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
  'players.json': { nextId: 2, players: { p00001: { id: 'p00001', name: 'Real Guy', birthSeason: 51 } } },
  'leagues/fbawc/teams.json': { league: 'fbawc', teams: [{ teamId: 'ITA', name: 'Italy', abbr: 'ITA', group: null, logoFolder: null, badge }] },
  'leagues/fbawc/S78/rosters.json': { league: 'fbawc', season: 78, locked: true, teams: { ITA: [entry('p00001', 'PG', 50)] } },
  'leagues/fbawc/S79/rosters.json': { league: 'fbawc', season: 79, locked: true, teams: { ITA: [entry('p00001', 'PG', 90), entry(null, 'SG', 70), entry(null, 'SF', null)] } },
};

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/league/:league" element={<LeaguePage />} />
      <Route path="/league/:league/team/:teamId" element={<TeamPage />} />
    </Routes>
  </MemoryRouter>,
);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('RosterTable generated entries', () => {
  it('shows Generated without a link, and keeps vacant slots vacant', () => {
    const { container } = render(
      <MemoryRouter>
        <RosterTable league="fbawc" entries={[entry(null, 'SG', 70), entry(null, 'SF', null)]} players={{}} />
      </MemoryRouter>,
    );
    const gen = screen.getByText('Generated');
    expect(gen.closest('a')).toBeNull();
    expect(gen.closest('tr')!.className).not.toContain('vacant');
    expect(screen.getByText('Vacant').closest('tr')!.className).toContain('vacant');
    expect(container.querySelectorAll('a').length).toBe(0);
  });
});

describe('World Cup pages use the stage rosters', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const doc = docs[url.replace('/api/state/', '')];
      return doc ? new Response(JSON.stringify(doc)) : new Response('{}', { status: 404 });
    }));
  });

  it('team page reads S79 rosters', async () => {
    renderAt('/league/fbawc/team/ITA');
    expect(await screen.findByText('Generated')).toBeTruthy();
    expect(screen.getByText('Vacant')).toBeTruthy();
  });

  it('league grid reads S79 rosters', async () => {
    renderAt('/league/fbawc');
    expect(await screen.findByText(/S79 rosters/)).toBeTruthy();
    expect(screen.getByText('80')).toBeTruthy();
  });

  it('falls back to the previous season, then the meta roster season', async () => {
    const orig = docs['leagues/fbawc/S79/rosters.json'];
    delete docs['leagues/fbawc/S79/rosters.json'];
    try {
      renderAt('/league/fbawc');
      expect(await screen.findByText(/S78 rosters/)).toBeTruthy();
    } finally { docs['leagues/fbawc/S79/rosters.json'] = orig; }
  });
});
