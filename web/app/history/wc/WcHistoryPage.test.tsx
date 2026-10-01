// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayersFile, SummaryFile, TeamsFile, WcHostsFile } from '../../../engine/shared/types';
import { WcHistoryPage } from './WcHistoryPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = { nextId: 2, players: { p1: { id: 'p1', name: 'Rowan Hawthorne', birthSeason: 40 } } };
const teams: TeamsFile = {
  league: 'fbawc',
  teams: [
    { teamId: 'GER', name: 'Germany', abbr: 'GER', group: 'WC', logoFolder: null, badge: { bg: '#000000', fg: '#ffffff' }, flag: 'de' },
    { teamId: 'ITA', name: 'Italy', abbr: 'ITA', group: 'WC', logoFolder: null, badge: { bg: '#0000ff', fg: '#ffffff' }, flag: 'it' },
    { teamId: 'AUS', name: 'Australia', abbr: 'AUS', group: 'WC', logoFolder: null, badge: { bg: '#00ff00', fg: '#000000' }, flag: 'au' },
  ],
};
const hosts: WcHostsFile = { hosts: [{ season: 78, city: 'Zagreb', country: 'Croatia' }, { season: 80, city: 'Mumbai', country: 'India' }] };
const seasons: SummaryFile[] = [
  { league: 'fbawc', season: 78, locked: true, host: 'Croatia', champions: [{ title: 'World Cup Champion', champion: 'Germany', runnerUp: 'Italy', score: null, teamId: 'GER', runnerUpId: 'ITA', finalsMvp: 'p1' }] },
  { league: 'fbawc', season: 76, locked: true, host: 'Spain', champions: [{ title: 'World Cup Champion', champion: 'Australia', runnerUp: 'Italy', score: null, teamId: 'AUS', runnerUpId: 'ITA' }] },
];

function stub(withHosts: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fbawc') return new Response(JSON.stringify({ seasons, errors: [] }));
    if (url === '/api/state/players.json') return new Response(JSON.stringify(players), { headers: { ETag: '"0000000000000001"' } });
    if (url === '/api/state/leagues/fbawc/teams.json') return new Response(JSON.stringify(teams), { headers: { ETag: '"0000000000000002"' } });
    if (withHosts && url === '/api/state/leagues/fbawc/hosts.json') return new Response(JSON.stringify(hosts), { headers: { ETag: '"0000000000000003"' } });
    return new Response('{}', { status: 404 });
  }));
}
const renderPage = () => render(<MemoryRouter><WcHistoryPage /></MemoryRouter>);

describe('World Cup history page', () => {
  it('shows tournaments, upcoming hosts, titles and the switch', async () => {
    stub(true);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'World Cup History' })).toBeTruthy();
    const row = (await screen.findAllByText('S78'))[0].closest('tr') as HTMLElement;
    expect(row.textContent).toContain('Zagreb, Croatia');
    expect(row.textContent).toContain('Germany');
    expect(row.textContent).toContain('Rowan Hawthorne');
    expect(within(row).getAllByAltText('Germany flag').length).toBeGreaterThan(0);
    const upcoming = (await screen.findByRole('heading', { name: 'Upcoming' })).parentElement as HTMLElement;
    expect(upcoming.textContent).toContain('S80');
    expect(upcoming.textContent).toContain('Mumbai, India');
    const titles = (await screen.findByRole('heading', { name: 'Titles' })).parentElement as HTMLElement;
    const ger = within(titles).getByText('Germany').closest('tr') as HTMLElement;
    expect(ger.textContent).toContain('1');
    expect(screen.getByRole('link', { name: 'World Cup' }).getAttribute('href')).toBe('/history/fbawc');
  });

  it('falls back to the summary host when hosts.json is missing', async () => {
    stub(false);
    renderPage();
    const row = (await screen.findAllByText('S78'))[0].closest('tr') as HTMLElement;
    expect(row.textContent).toContain('Croatia');
    expect(row.textContent).not.toContain('Zagreb');
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
  });
});
