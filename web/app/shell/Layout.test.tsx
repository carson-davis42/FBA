// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';

const calendar = {
  season: 79,
  steps: [
    { id: 'adjust-age', label: 'Adjust Age', kind: 'offseason', league: null, sub: true, done: true },
    { id: 'fa', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/state/calendar.json') return new Response(JSON.stringify(calendar));
    if (url === '/api/state/players.json') return new Response(JSON.stringify({ nextId: 1, players: {} }));
    if (url === '/api/history/fba') return new Response(JSON.stringify({ seasons: [], errors: [] }));
    return new Response(JSON.stringify({ error: 'nf' }), { status: 404 });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
});

describe('Layout', () => {
  it('shows the brand, league links, and the season pill', async () => {
    render(<MemoryRouter initialEntries={['/history']}><Layout /></MemoryRouter>);
    expect(screen.getByText('FBA Universe')).toBeTruthy();
    const leagues = screen.getByRole('navigation', { name: 'Leagues' });
    for (const label of ['FBA', 'D2', 'JC', 'WC']) expect(within(leagues).getByRole('link', { name: label })).toBeTruthy();
    expect(await screen.findByText('S79 · Free Agency/Offseason')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'History' })).toBeTruthy();
  });

  it('links the Hall of Fame to History and serves that route', async () => {
    render(<MemoryRouter initialEntries={['/history/fba/hall-of-fame']}><Layout /></MemoryRouter>);
    expect(within(screen.getByRole('navigation', { name: 'Site sections' })).getByRole('link', { name: 'Hall of Fame' }).getAttribute('href')).toBe('/history/fba/hall-of-fame');
    expect(await screen.findByRole('heading', { name: 'Hall of Fame' })).toBeTruthy();
  });

  it('toggles the dark theme', () => {
    render(<MemoryRouter><Layout /></MemoryRouter>);
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: /dark mode/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
