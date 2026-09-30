// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AwardCountsFile, PlayersFile, SummaryFile, SummaryPlayerLine } from '../../engine/shared/types';
import { AwardsByPlayerPage } from './AwardsByPlayerPage';
import { HistoryHome } from './HistoryHome';
import { LeadersPage } from './LeadersPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = {
  nextId: 4,
  players: {
    p00001: { id: 'p00001', name: 'Ann Alpha', birthSeason: 40 },
    p00002: { id: 'p00002', name: 'Bob Beta', birthSeason: 41 },
    p00003: { id: 'p00003', name: 'Cy Thirty', birthSeason: 42 },
  },
};

const baseline: AwardCountsFile = {
  league: 'fba', throughSeason: 78,
  counts: [
    { playerId: 'p00001', key: 'MVP', count: 2 },
    { playerId: 'p00001', key: 'ALL_STAR', count: 1 },
    { playerId: 'p00002', key: 'MVP', count: 1 },
    { playerId: 'p00002', key: 'ALL_STAR', count: 5 },
    { playerId: 'p00003', key: 'CONF_CHAMPION', count: 4 },
  ],
};

const line = (playerId: string, g: number, pts: number): SummaryPlayerLine => ({
  playerId, teamId: 'BOS', stint: 1, position: 'SF', ratingStart: 70, ratingEnd: 72,
  rs: { g, pts, def: 0, stops: 0, allowed: 0, exp: 0 }, po: null,
});
const s79: SummaryFile = {
  league: 'fba', season: 79, locked: true, host: null, champions: [],
  players: [line('p00001', 60, 1200), line('p00002', 50, 900), line('p00003', 30, 900)],
};

function stub(opts: { counts?: AwardCountsFile | null; seasons?: SummaryFile[]; errors?: { season: number; message: string }[] } = {}) {
  const counts = 'counts' in opts ? opts.counts : baseline;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fba') return new Response(JSON.stringify({ seasons: opts.seasons ?? [s79], errors: opts.errors ?? [] }));
    const docs: Record<string, unknown> = { '/api/state/players.json': players };
    if (counts) docs['/api/state/leagues/fba/awardCounts.json'] = counts;
    if (url in docs) return new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } });
    return new Response('{}', { status: 404 });
  }));
}

const renderAt = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>);
const names = () => screen.getAllByRole('row').slice(1).map(r => r.querySelector('td')?.textContent);

describe('AwardsByPlayerPage', () => {
  it('sorts by MVP by default, leaves out players with only Conf. Champion, and re-sorts on a header click', async () => {
    stub();
    renderAt(<AwardsByPlayerPage />);
    expect(await screen.findByRole('heading', { name: 'Awards by player' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Ann Alpha' })).toBeTruthy();
    expect(names()).toEqual(['Ann Alpha', 'Bob Beta']);
    expect(screen.queryByRole('link', { name: 'Cy Thirty' })).toBeNull();
    expect(screen.queryByText(/haven't been imported/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ASG' }));
    expect(names()).toEqual(['Bob Beta', 'Ann Alpha']);
  });

  it('warns when the award counts baseline is missing', async () => {
    stub({ counts: null });
    renderAt(<AwardsByPlayerPage />);
    expect(await screen.findByText("Award counts before S79 haven't been imported")).toBeTruthy();
  });

  it('shows the skipped-seasons warning', async () => {
    stub({ errors: [{ season: 12, message: 'bad' }] });
    renderAt(<AwardsByPlayerPage />);
    expect(await screen.findByText(/Some seasons couldn't be read: S12/)).toBeTruthy();
  });
});

describe('LeadersPage', () => {
  it('leaves a 30-game player out of the points-per-game table but keeps them in Points and Games', async () => {
    stub();
    renderAt(<LeadersPage />);
    expect(await screen.findByRole('heading', { name: 'Career leaders' })).toBeTruthy();
    const tables = await screen.findAllByRole('table');
    expect(tables).toHaveLength(3);
    const first = (t: HTMLElement) => Array.from(t.querySelectorAll('tbody tr')).map(r => r.querySelectorAll('td')[1].textContent);
    expect(first(tables[0])).toEqual(['Ann Alpha', 'Bob Beta', 'Cy Thirty']);
    expect(first(tables[1])).toEqual(['Ann Alpha', 'Bob Beta', 'Cy Thirty']);
    expect(first(tables[2])).toEqual(['Ann Alpha', 'Bob Beta']);
    expect(tables[2].querySelectorAll('tbody tr')[0].querySelectorAll('td')[2].textContent).toBe('20.0');
  });

  it('says so when no seasons have been played in the app', async () => {
    stub({ seasons: [] });
    renderAt(<LeadersPage />);
    expect(await screen.findByText('No seasons played in the app yet')).toBeTruthy();
  });
});

describe('HistoryHome', () => {
  it('links to Awards by player, Career leaders and Hall of Fame', async () => {
    stub();
    renderAt(<HistoryHome />);
    await screen.findByRole('heading', { name: 'History' });
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Awards by player')).toBe('/history/fba/awards/players');
    expect(href('Career leaders')).toBe('/history/fba/leaders');
    expect(href('Hall of Fame')).toBe('/history/fba/hall-of-fame');
  });
});
