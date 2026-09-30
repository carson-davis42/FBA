// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayersFile, SummaryFile } from '../../engine/shared/types';
import { AwardsHistoryPage } from './AwardsHistoryPage';
import { ChampionshipsPage } from './ChampionshipsPage';
import { HistoryHome } from './HistoryHome';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = {
  nextId: 4,
  players: {
    p00001: { id: 'p00001', name: 'Cameron Lučić', birthSeason: 40 },
    p00002: { id: 'p00002', name: 'Ray Allen', birthSeason: 41 },
    p00003: { id: 'p00003', name: 'Sam Nobody', birthSeason: 42 },
  },
};

const s47: SummaryFile = {
  league: 'fba', season: 47, locked: true, host: null,
  champions: [{ title: 'FBA Champion', champion: 'Utah', runnerUp: 'Boston', score: '4-3', finalsMvp: 'p00002' }],
  awards: [{ award: 'MVP', playerId: 'p00002', teamId: '?' }],
  confChampions: { E: 'Boston', W: 'Utah' },
};
const s48: SummaryFile = {
  league: 'fba', season: 48, locked: true, host: null,
  champions: [{ title: 'FBA Champion', champion: 'Boston', runnerUp: 'Utah', score: '4-2', finalsMvp: 'p00001' }],
  awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'BOS' }, { award: 'DPOY', playerId: 'p00003', teamId: 'UTA' }],
  confChampions: { E: 'Boston', W: 'Utah' },
};

function stub(errors: { season: number; message: string }[] = [], fail = false, seasons: SummaryFile[] = [s47, s48]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fba') {
      if (fail) return new Response('nope', { status: 500 });
      return new Response(JSON.stringify({ seasons, errors }));
    }
    if (url === '/api/state/players.json') return new Response(JSON.stringify(players), { headers: { ETag: '"0000000000000001"' } });
    return new Response('{}', { status: 404 });
  }));
}

const renderAt = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>);

describe('History pages', () => {
  it('the hub links to the four sections, Seasons at the latest season', async () => {
    stub();
    renderAt(<HistoryHome />);
    expect(await screen.findByRole('heading', { name: 'History' })).toBeTruthy();
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Championships')).toBe('/history/fba/championships');
    expect(href('Awards')).toBe('/history/fba/awards');
    expect(href('Seasons')).toBe('/history/fba/season/48');
    expect(href('Players')).toBe('/history/fba/players');
  });

  it('lists championships newest first with the en-dash score and a Finals MVP link', async () => {
    stub();
    renderAt(<ChampionshipsPage />);
    expect(await screen.findByRole('heading', { name: 'FBA Championships' })).toBeTruthy();
    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('link', { name: 'S48' }).getAttribute('href')).toBe('/history/fba/season/48');
    expect(rows[0].textContent).toContain('Boston');
    expect(rows[0].textContent).toContain('4–2');
    expect(within(rows[0]).getByRole('link', { name: 'Cameron Lučić' }).getAttribute('href')).toBe('/history/fba/players/p00001');
    expect(within(rows[1]).getByRole('link', { name: 'S47' })).toBeTruthy();
    expect(rows[1].textContent).toContain('4–3');
  });

  it('shows the award winners as links with their team, and no team for ?', async () => {
    stub();
    renderAt(<AwardsHistoryPage />);
    expect(await screen.findByRole('heading', { name: 'FBA Awards' })).toBeTruthy();
    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(within(rows[0]).getByRole('link', { name: 'Cameron Lučić' }).getAttribute('href')).toBe('/history/fba/players/p00001');
    expect(rows[0].textContent).toContain('Cameron Lučić (BOS)');
    expect(rows[0].textContent).toContain('Sam Nobody (UTA)');
    expect(rows[1].textContent).toContain('Ray Allen');
    expect(rows[1].textContent).not.toContain('(?)');
    expect(rows[1].textContent).not.toContain('Ray Allen (');
  });

  it('renders the Championships and Awards pages with no seasons', async () => {
    stub([], false, []);
    renderAt(<ChampionshipsPage />);
    expect(await screen.findByRole('heading', { name: 'FBA Championships' })).toBeTruthy();
    expect(screen.queryAllByRole('row').slice(1)).toHaveLength(0);
    cleanup();
    renderAt(<AwardsHistoryPage />);
    expect(await screen.findByRole('heading', { name: 'FBA Awards' })).toBeTruthy();
    expect(screen.queryAllByRole('row').slice(1)).toHaveLength(0);
  });

  it('warns about seasons that could not be read', async () => {
    stub([{ season: 10, message: 'bad' }, { season: 11, message: 'bad' }]);
    renderAt(<ChampionshipsPage />);
    const warning = await screen.findByText("Some seasons couldn't be read: S10, S11");
    expect(warning.className).toBe('warning');
  });

  it('shows Loading… and then a fetch error', async () => {
    stub([], true);
    renderAt(<AwardsHistoryPage />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    const err = await screen.findByText(/Couldn't load the history/);
    expect(err.className).toBe('error');
  });
});
