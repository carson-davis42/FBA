// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayersPage } from './PlayersPage';

const badge = { bg: 'hsl(10 55% 36%)', fg: '#ffffff' };
const r = (playerId: string | null, position: string, rating: number | null, age: number | null, extra: Record<string, unknown> = {}) => ({ playerId, position, rating, age, points: 0, ...extra });
const line = (playerId: string, pts: number) => ({ playerId, pts });
const docs: Record<string, unknown> = {
  'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
  'players.json': { nextId: 5, players: {
    p00001: { id: 'p00001', name: 'Gabriel Greenwood', birthSeason: 51 },
    p00002: { id: 'p00002', name: 'Ivory Huntley', birthSeason: 53 },
    p00003: { id: 'p00003', name: 'Alan Zed', birthSeason: 55 },
    p00004: { id: 'p00004', name: 'Cal Young', birthSeason: 56 },
  } },
  'leagues/fba/teams.json': { league: 'fba', teams: [
    { teamId: 'BOS', name: 'Boston Bucks', abbr: 'BOS', group: 'E', logoFolder: null, badge },
    { teamId: 'MEM', name: 'Memphis Blues', abbr: 'MEM', group: 'W', logoFolder: null, badge },
  ] },
  'leagues/fba/S79/rosters.json': { league: 'fba', season: 79, locked: false, teams: {
    BOS: [r('p00001', 'PG', 90, 28, { contractAmount: 8, contractEnd: 80 }), r(null, 'SG', null, null), r('p00003', 'C', 90, 31, { contractAmount: 3, contractEnd: 79 })],
    MEM: [r('p00002', 'SF', 95, 26, { contractAmount: 9, contractEnd: 81 }), r('p00004', 'PG', 70, 22, { contractAmount: 1, contractEnd: 79 })],
  } },
  'leagues/fba/S79/results.json': { league: 'fba', season: 79, locked: false, games: [
    { gameNo: 1, home: 'BOS', away: 'MEM', homePts: 30, awayPts: 20, box: { home: [line('p00001', 20), line('p00003', 10)], away: [line('p00002', 12), line('p00004', 8)] } },
    { gameNo: 2, home: 'BOS', away: 'MEM', homePts: 30, awayPts: 20, box: { home: [line('p00001', 10), line('p00003', 20)], away: [line('p00002', 18)] } },
  ] },
  'leagues/fbad2/teams.json': { league: 'fbad2', teams: [{ teamId: 'ACK', name: 'Auckland', abbr: 'ACK', group: 'IL', logoFolder: null, badge }] },
  'leagues/fbad2/S79/rosters.json': { league: 'fbad2', season: 79, locked: false, teams: { ACK: [r('p00004', 'PG', 80, 25)] } },
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
    <Routes><Route path="/league/:league/players" element={<PlayersPage />} /></Routes>
  </MemoryRouter>,
);
const names = () => screen.getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[1].textContent);
const ranks = () => screen.getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[0].textContent);

describe('PlayersPage', () => {
  it('sorts by rating, then PPG, then name by default, and skips vacant slots', async () => {
    renderAt('/league/fba/players');
    await screen.findByText('Ivory Huntley');
    // Ivory 95; Gabriel 90 (15 ppg) before Alan 90 (15 ppg): tie on both, so name; Cal 70.
    expect(names()).toEqual(['Ivory Huntley', 'Alan Zed', 'Gabriel Greenwood', 'Cal Young']);
    expect(ranks()).toEqual(['1', '2', '3', '4']);
  });

  it('shows games, PPG, points and contract', async () => {
    renderAt('/league/fba/players');
    await screen.findByText('Ivory Huntley');
    const row = screen.getAllByRole('row').find(x => x.textContent?.includes('Gabriel Greenwood'))!;
    const cells = within(row).getAllByRole('cell').map(c => c.textContent);
    expect(cells.slice(3)).toEqual(['PG', '90', '28', '2', '15.0', '30', '$8 · S80']);
  });

  it('sorts by clicked columns and toggles direction', async () => {
    renderAt('/league/fba/players');
    await screen.findByText('Ivory Huntley');
    fireEvent.click(screen.getByRole('button', { name: /^Age/ }));
    expect(names()).toEqual(['Cal Young', 'Ivory Huntley', 'Gabriel Greenwood', 'Alan Zed']);
    fireEvent.click(screen.getByRole('button', { name: /^Age/ }));
    expect(names()).toEqual(['Alan Zed', 'Gabriel Greenwood', 'Ivory Huntley', 'Cal Young']);
    fireEvent.click(screen.getByRole('button', { name: /^PPG/ }));
    expect(names()[0]).toBe('Ivory Huntley');
    fireEvent.click(screen.getByRole('button', { name: /^Player/ }));
    expect(names()).toEqual(['Alan Zed', 'Cal Young', 'Gabriel Greenwood', 'Ivory Huntley']);
    fireEvent.click(screen.getByRole('button', { name: /^Team/ }));
    expect(names()).toEqual(['Alan Zed', 'Gabriel Greenwood', 'Ivory Huntley', 'Cal Young']);
  });

  it('filters by team, position and name, and ranks after filtering', async () => {
    renderAt('/league/fba/players');
    await screen.findByText('Ivory Huntley');
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'MEM' } });
    expect(names()).toEqual(['Ivory Huntley', 'Cal Young']);
    expect(ranks()).toEqual(['1', '2']);
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'PG' } });
    expect(names()).toEqual(['Cal Young']);
    expect(ranks()).toEqual(['1']);
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'ZED' } });
    expect(names()).toEqual(['Alan Zed']);
  });

  it('links players to their history and teams to their pages', async () => {
    renderAt('/league/fba/players');
    expect((await screen.findByRole('link', { name: 'Ivory Huntley' })).getAttribute('href')).toBe('/history/fba/players/p00002');
    expect(screen.getAllByRole('link', { name: 'MEM' })[0].getAttribute('href')).toBe('/league/fba/team/MEM');
  });

  it('has no contract column for the D2 and treats a missing results doc as no games', async () => {
    renderAt('/league/fbad2/players');
    await screen.findByText('Cal Young');
    expect(screen.queryByRole('button', { name: /^Contract/ })).toBeNull();
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell').map(c => c.textContent);
    expect(cells.slice(3)).toEqual(['PG', '80', '25', '—', '—', '—']);
  });
});
