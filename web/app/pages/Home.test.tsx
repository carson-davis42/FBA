// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
  'leagues/fbad2/S78/summary.json': { league: 'fbad2', season: 78, locked: true, host: null, champions: [{ title: 'Premier League Champion', champion: 'Salzburg', runnerUp: 'Zurich', score: '4-1' }] },
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
    expect(screen.getByRole('link', { name: /continue/i }).getAttribute('href')).toBe('/league/fbad2');
  });

  it('lists last champions for every league', async () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(await screen.findByText('Boston Bucks')).toBeTruthy();
    expect(await screen.findByText('Salzburg')).toBeTruthy();
    expect(await screen.findByText('North Carolina')).toBeTruthy();
    expect(await screen.findByText('Germany')).toBeTruthy();
    expect(screen.getByText(/host: Croatia/)).toBeTruthy();
  });
});
