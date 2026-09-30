// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayersFile, SummaryFile, TeamsFile } from '../../../engine/shared/types';
import { HistoryHome } from '../HistoryHome';
import { D2AwardsPage } from './D2AwardsPage';
import { D2ChampionshipsPage } from './D2ChampionshipsPage';
import { D2HistoryHome } from './D2HistoryHome';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = {
  nextId: 3,
  players: {
    p00001: { id: 'p00001', name: 'Cameron Lučić', birthSeason: 40 },
    p00002: { id: 'p00002', name: 'Ray Allen', birthSeason: 41 },
  },
};
const teams: TeamsFile = {
  league: 'fbad2',
  teams: [{ teamId: 'LIS', name: 'Lisbon', abbr: 'LIS', group: 'PL', logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } }],
};

const s55: SummaryFile = {
  league: 'fbad2', season: 55, locked: true, host: null,
  champions: [
    { title: 'D2 International Champion (1)', champion: 'Oslo', runnerUp: 'Bern', score: '4-1', group: 'D2', finalsMvp: 'p00001' },
    { title: 'D2 International Champion (2)', champion: 'Riga', runnerUp: null, score: null, group: 'D2' },
  ],
  awards: [{ award: 'MVP-D2', playerId: 'p00001', teamId: 'OSL' }, { award: 'MVP-D2', playerId: 'p00001', teamId: 'OSL' }],
};
const s69: SummaryFile = {
  league: 'fbad2', season: 69, locked: true, host: null,
  champions: [
    { title: 'Premier League Champion', champion: 'Lisbon', runnerUp: 'Rome', score: '4-2', group: 'PL', finalsMvp: 'p00002' },
    { title: 'Ultra League Champion', champion: 'Oslo', runnerUp: 'Bern', score: null, group: 'UL' },
  ],
  awards: [{ award: 'MVP-PL', playerId: 'p00002', teamId: 'LIS' }],
  rsChampions: [{ group: 'PL', teams: ['Munich', 'Rome'] }],
};

function stub() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fbad2') return new Response(JSON.stringify({ seasons: [s55, s69], errors: [] }));
    if (url === '/api/history/fba') return new Response(JSON.stringify({ seasons: [], errors: [] }));
    if (url === '/api/state/players.json') return new Response(JSON.stringify(players), { headers: { ETag: '"0000000000000001"' } });
    if (url === '/api/state/leagues/fbad2/teams.json') return new Response(JSON.stringify(teams), { headers: { ETag: '"0000000000000002"' } });
    return new Response('{}', { status: 404 });
  }));
}
const renderAt = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>);

describe('D2 history pages', () => {
  it('the hub links to the sections and the league switch', async () => {
    stub();
    renderAt(<D2HistoryHome />);
    expect(await screen.findByRole('heading', { name: 'History' })).toBeTruthy();
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Championships')).toBe('/history/fbad2/championships');
    expect(href('Awards')).toBe('/history/fbad2/awards');
    expect(href('Seasons')).toBe('/history/fbad2/season/69');
    expect(href('Teams')).toBe('/history/fbad2/teams');
    expect(href('Drafts')).toBe('/history/fbad2/drafts');
    expect(href('FBA')).toBe('/history');
    expect(href('D2')).toBe('/history/fbad2');
  });

  it('lists the titles newest first with linked known teams', async () => {
    stub();
    const { container } = renderAt(<D2ChampionshipsPage />);
    expect(await screen.findByRole('heading', { name: 'D2 Championships' })).toBeTruthy();
    await screen.findAllByRole('listitem');
    const rows = [...container.querySelectorAll<HTMLElement>('.timeline-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Premier League');
    expect(within(rows[0]).getByRole('link', { name: 'Lisbon' }).getAttribute('href')).toBe('/history/fbad2/teams/LIS');
    expect(rows[0].textContent).toContain('Rome');
    expect(within(rows[0]).queryByRole('link', { name: 'Rome' })).toBeNull();
    expect(rows[0].textContent).toContain('Series MVP');
    expect(rows[1].textContent).toContain('D2 International Champion (1)');
    expect(rows[1].textContent).toContain('(2)');
  });

  it('shows MVPs, regular-season champions and the most-MVP list', async () => {
    stub();
    renderAt(<D2AwardsPage />);
    expect(await screen.findByRole('heading', { name: 'D2 Awards' })).toBeTruthy();
    const row = (await screen.findByRole('link', { name: 'S69' })).closest('tr') as HTMLElement;
    expect(row.textContent).toContain('Premier League MVP');
    expect(row.textContent).toContain('Premier League: Munich / Rome');
    const most = (await screen.findByRole('heading', { name: 'Most MVPs' })).parentElement!.querySelector('ol') as HTMLElement;
    expect(within(most).getAllByRole('listitem')[0].textContent).toContain('Cameron Lučić');
    expect(within(most).getAllByRole('listitem')[0].textContent).toContain('×2');
  });

  it('the FBA hub shows the league switch', async () => {
    stub();
    renderAt(<HistoryHome />);
    expect((await screen.findByRole('link', { name: 'D2' })).getAttribute('href')).toBe('/history/fbad2');
  });
});
