// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaguePage } from './LeaguePage';
import { TeamPage } from './TeamPage';

const badge = { bg: 'hsl(10 55% 36%)', fg: '#ffffff' };
const docs: Record<string, unknown> = {
  'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
  'players.json': { nextId: 3, players: { p00001: { id: 'p00001', name: 'Gabriel Greenwood', birthSeason: 51 }, p00002: { id: 'p00002', name: 'Ivory Huntley', birthSeason: 53 } } },
  'leagues/fba/teams.json': { league: 'fba', teams: [
    { teamId: 'BOS', name: 'Boston Bucks', abbr: 'BOS', group: 'E', logoFolder: 'Boston Bucks', badge },
    { teamId: 'MEM', name: 'Memphis Blues', abbr: 'MEM', group: 'W', logoFolder: null, badge },
  ] },
  'leagues/fba/S79/rosters.json': { league: 'fba', season: 79, locked: false, teams: {
    BOS: [{ playerId: 'p00001', position: 'PG', rating: 95, age: 28, points: 0, contractEnd: 80, contractAmount: 8 }, { playerId: null, position: 'SG', rating: null, age: null, points: 0, contractEnd: null, contractAmount: null }],
    MEM: [{ playerId: 'p00002', position: 'PG', rating: 97, age: 26, points: 0, contractEnd: 81, contractAmount: 9 }],
  } },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc)) : new Response('{}', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/league/:league" element={<LeaguePage />} />
      <Route path="/league/:league/team/:teamId" element={<TeamPage />} />
    </Routes>
  </MemoryRouter>,
);

describe('LeaguePage', () => {
  it('groups teams by conference with ratings', async () => {
    renderAt('/league/fba');
    expect(await screen.findByText('Eastern Conference')).toBeTruthy();
    expect(screen.getByText('Western Conference')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Boston Bucks/ }).getAttribute('href')).toBe('/league/fba/team/BOS');
    expect(screen.getByText('97')).toBeTruthy();
  });

  it('rejects an unknown league', () => {
    renderAt('/league/nba');
    expect(screen.getByText(/Unknown league/)).toBeTruthy();
  });
});

describe('TeamPage', () => {
  it('shows the roster with contract and vacancy', async () => {
    renderAt('/league/fba/team/BOS');
    expect(await screen.findByText('Gabriel Greenwood')).toBeTruthy();
    expect(screen.getByText('S80 · $8')).toBeTruthy();
    expect(screen.getByText('Vacant')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Boston Bucks logo' }).getAttribute('src')).toBe('/logos/Boston%20Bucks/79');
  });
});
