// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from './Home';

const docs: Record<string, unknown> = {
  'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
  'calendar.json': { season: 79, steps: [
    { id: 'fa', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: true },
    { id: 'fba-d2', label: 'FBA D2', kind: 'league', league: 'fbad2', sub: false, done: false },
  ] },
  'leagues/fba/S78/summary.json': { league: 'fba', season: 78, locked: true, host: null, champions: [{ title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4-1' }] },
  'leagues/fbad2/S78/summary.json': { league: 'fbad2', season: 78, locked: true, host: null, champions: [{ title: 'Premier League Champion', champion: 'Salzburg BC', runnerUp: 'Zurich', score: '4-1' }] },
  'leagues/fbajc/S78/summary.json': { league: 'fbajc', season: 78, locked: true, host: null, champions: [{ title: 'National Champion', champion: 'North Carolina', runnerUp: 'Syracuse', score: null }] },
  'leagues/fbawc/S78/summary.json': { league: 'fbawc', season: 78, locked: true, host: 'Croatia', champions: [{ title: 'World Cup Champion', champion: 'Germany', runnerUp: 'Italy', score: null }] },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc)) : new Response('{}', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Home', () => {
  it('shows the next step with a Continue link to that league', async () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(await screen.findByText('Play FBAD2 S79')).toBeTruthy();
    expect(screen.getByRole('link', { name: /continue/i }).getAttribute('href')).toBe('/league/fbad2/scores');
  });

  it('titles the qualifying step and continues to the qualifying page', async () => {
    const cal = docs['calendar.json'];
    docs['calendar.json'] = { season: 79, steps: [{ id: 's79-qualifying', label: 'WC Qualifying', kind: 'league', league: 'fbawc', sub: false, done: false }] };
    try {
      render(<MemoryRouter><Home /></MemoryRouter>);
      expect(await screen.findByText('World Cup qualifying S79')).toBeTruthy();
      expect(screen.getByRole('link', { name: /continue/i }).getAttribute('href')).toBe('/league/fbawc/qualifying');
    } finally {
      docs['calendar.json'] = cal;
    }
  });

  it('lists last champions for every league', async () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(await screen.findByText('Boston Bucks')).toBeTruthy();
    expect(await screen.findByText('Salzburg BC')).toBeTruthy();
    expect(await screen.findByText('North Carolina')).toBeTruthy();
    expect(await screen.findByText('Germany')).toBeTruthy();
    expect(screen.getByText(/host: Croatia/)).toBeTruthy();
  });

  it('continues to the playoffs once the current league has finished its regular season', async () => {
    docs['leagues/fbad2/S79/schedule.json'] = { league: 'fbad2', season: 79, locked: false, games: [{ gameNo: 1, home: 'A', away: 'B' }], pauses: [] };
    docs['leagues/fbad2/S79/results.json'] = { league: 'fbad2', season: 79, locked: false, games: [{ gameNo: 1, home: 'A', away: 'B', homePts: 70, awayPts: 60 }] };
    try {
      render(<MemoryRouter><Home /></MemoryRouter>);
      await waitFor(() => expect(screen.getByRole('link', { name: /continue/i }).getAttribute('href')).toBe('/league/fbad2/playoffs'));
    } finally {
      delete docs['leagues/fbad2/S79/schedule.json'];
      delete docs['leagues/fbad2/S79/results.json'];
    }
  });

  it('titles the FBAJC step like the other league steps and continues to its scores page', async () => {
    const cal = docs['calendar.json'];
    docs['calendar.json'] = { season: 79, steps: [{ id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: false }] };
    try {
      render(<MemoryRouter><Home /></MemoryRouter>);
      expect(await screen.findByText('Play FBAJC S79')).toBeTruthy();
      expect(screen.getByRole('link', { name: /continue/i }).getAttribute('href')).toBe('/league/fbajc/scores');
    } finally {
      docs['calendar.json'] = cal;
    }
  });

  it('continues to the next season once every step is done', async () => {
    const cal = docs['calendar.json'];
    docs['calendar.json'] = { season: 79, steps: [{ id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: true }] };
    try {
      render(<MemoryRouter><Home /></MemoryRouter>);
      expect(await screen.findByText('Season 79 complete')).toBeTruthy();
      expect(screen.getByRole('link', { name: /continue/i }).getAttribute('href')).toBe('/next-season');
    } finally {
      docs['calendar.json'] = cal;
    }
  });

  it('shows the transfer-portal banner while the portal is open, and hides it otherwise', async () => {
    const cal = docs['calendar.json'];
    docs['calendar.json'] = { season: 79, steps: [
      { id: 'make-s79-schedules', label: 'Make S79 Schedules', kind: 'offseason', league: null, sub: false, done: true },
      { id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: false },
    ] };
    docs['leagues/fbajc/S78/recruiting.json'] = { league: 'fbajc', season: 78, classOf: 79, locked: false, classDraft: [], created: true, recruits: [], portal: [{ playerId: 'p1' }] };
    try {
      const { unmount } = render(<MemoryRouter><Home /></MemoryRouter>);
      expect(await screen.findByText('The S79 transfer portal is open · 1 player in it')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Open the portal ▸' }).getAttribute('href')).toBe('/league/fbajc/portal');
      unmount();
      docs['calendar.json'] = { season: 79, steps: [{ id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: true }] };
      render(<MemoryRouter><Home /></MemoryRouter>);
      expect(await screen.findByText('Season 79 complete')).toBeTruthy();
      await new Promise(r => setTimeout(r, 20));
      expect(screen.queryByText(/transfer portal is open/)).toBeNull();
    } finally {
      docs['calendar.json'] = cal;
      delete docs['leagues/fbajc/S78/recruiting.json'];
    }
  });

  it("shows this season's champions once that season is finished", async () => {
    docs['leagues/fba/S79/summary.json'] = { league: 'fba', season: 79, locked: true, host: null, champions: [{ title: 'FBA Champion', champion: 'Hawaii Volcanoes', runnerUp: 'Boston Bucks', score: '4–2' }] };
    try {
      render(<MemoryRouter><Home /></MemoryRouter>);
      expect(await screen.findByText('Hawaii Volcanoes')).toBeTruthy();
      expect(screen.getByText('FBA S79 · FBA Champion')).toBeTruthy();
      expect(screen.queryByText('Boston Bucks')).toBeNull();
      expect(await screen.findByText('Salzburg BC')).toBeTruthy();
    } finally {
      delete docs['leagues/fba/S79/summary.json'];
    }
  });
});
