// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventsFile, FranchisesFile, SummaryFile, Team } from '../../engine/shared/types';
import { TimelinePage } from './TimelinePage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const team = (teamId: string, name: string, abbr: string): Team => ({ teamId, name, abbr, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams = { league: 'fba', teams: [team('SEA', 'Seattle Shock', 'SEA')] };
const era = (name: string, from: number) => ({ name, abbr: 'SEA', city: 'Seattle', from, to: null });
const franchises: FranchisesFile = { franchises: [{ teamId: 'SEA', eras: [era('Seattle Shock', 59)] }, { teamId: 'LAL', eras: [era('Los Angeles', 80)] }] };
const summaries = [{ league: 'fba', season: 59, locked: true, host: null, champions: [{ title: 'FBA Champion', champion: 'Seattle Shock', teamId: 'SEA' }] }] as unknown as SummaryFile[];
const events: EventsFile = { before: [{ label: 'Founding', notes: ['The league began'] }], seasons: [{ season: 59, notes: [], rules: ['Draft every season'] }] };

function stub(withEvents: boolean) {
  const docs: Record<string, unknown> = {
    '/api/state/leagues/fba/teams.json': teams,
    '/api/state/leagues/fba/franchises.json': franchises,
    '/api/state/meta.json': { currentSeason: 79 },
    '/api/history/fba': { seasons: summaries, errors: [] },
  };
  if (withEvents) docs['/api/state/leagues/fba/events.json'] = events;
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url in docs ? new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } }) : new Response('{}', { status: 404 })));
}
const renderPage = () => render(
  <MemoryRouter initialEntries={['/history/fba/events']}>
    <Routes><Route path="/history/fba/events" element={<TimelinePage />} /></Routes>
  </MemoryRouter>,
);

describe('TimelinePage', () => {
  it('shows milestones, rule changes and the pre-FBA block', async () => {
    stub(true);
    renderPage();
    expect(await screen.findByText('Draft every season')).toBeTruthy();
    expect(screen.getByText('Rule changes')).toBeTruthy();
    expect(screen.getByText('New: Seattle Shock')).toBeTruthy();
    expect(screen.getByText('Before the FBA')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'S59' }).getAttribute('href')).toBe('/history/fba/season/59');
  });

  it('shows a hint when the events doc is missing', async () => {
    stub(false);
    renderPage();
    expect(await screen.findByText('Run npm run import -- --events --data data for league notes and rule changes.')).toBeTruthy();
    expect(screen.getByText('New: Seattle Shock')).toBeTruthy();
  });

  it('does not show a season that has not started yet', async () => {
    stub(true);
    renderPage();
    await screen.findByText('Draft every season');
    expect(screen.queryByText('S80')).toBeNull();
    expect(screen.queryByText('New: Los Angeles')).toBeNull();
  });

  it('shows an error when the events doc fails to load', async () => {
    stub(true);
    const ok = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/api/state/leagues/fba/events.json' ? new Response('boom', { status: 500 }) : ok(url)));
    renderPage();
    expect((await screen.findByText(/Couldn't load the history/)).className).toBe('error');
  });
});
