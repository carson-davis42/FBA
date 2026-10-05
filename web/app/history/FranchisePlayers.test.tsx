// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { Franchise, PlayersFile, RostersFile } from '../../engine/shared/types';
import { FranchisePlayers } from './FranchisePlayers';

afterEach(cleanup);

const franchise: Franchise = {
  teamId: 'MON',
  eras: [
    { name: 'Montreal', abbr: 'MON', city: 'Montreal', from: 12, to: null },
    { name: 'Texas Outlaws', abbr: 'TEX', city: 'Dallas', from: 1, to: 10 },
  ],
};
const players: PlayersFile = {
  nextId: 4,
  players: {
    p00001: { id: 'p00001', name: 'Ann Able', birthSeason: 40 },
    p00002: { id: 'p00002', name: 'Bo Baker', birthSeason: 40 },
    p00003: { id: 'p00003', name: 'Cy Cole', birthSeason: 40 },
  },
};
const bio = (playerId: string, ...entries: string[]) => ({ playerId, born: 'Born-S40', entries });
const bios = { league: 'fba' as const, bios: [bio('p00001', 'TEX-S5-S10', 'S7 MVP', '2x Young-Star', 'MON-S12-S13'), bio('p00002', 'MON-S13')] };
const rosters: RostersFile[] = [{
  league: 'fba', season: 78, locked: false,
  teams: { MON: [{ playerId: 'p00003', position: 'PG', rating: 88, age: 24, points: 900 }] },
}];

const renderTab = (search = '?tab=players') => render(
  <MemoryRouter initialEntries={[`/t${search}`]}>
    <FranchisePlayers franchise={franchise} players={players} bios={bios} summaries={[]} hof={null} rosters={rosters} latest={79} />
  </MemoryRouter>,
);
const bodyRows = () => screen.getAllByRole('row').slice(1).map(r => r.textContent ?? '');

describe('FranchisePlayers', () => {
  it('lists every player with their seasons and accolades', () => {
    renderTab();
    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('Ann Able');
    expect(rows[0]).toContain('S5–S10, S12–S13');
    expect(rows[0]).toContain('MVP (S7)');
    expect(rows[0]).toContain('2x Young-Star');
  });

  it('filters by name and sorts', () => {
    renderTab();
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'bo' } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Sort players'), { target: { value: 'name' } });
    expect(bodyRows().map(r => r.slice(0, 3))).toEqual(['Ann', 'Bo ', 'Cy ']);
    fireEvent.change(screen.getByLabelText('Sort players'), { target: { value: 'seasons' } });
    expect(bodyRows()[0]).toContain('Ann Able');
  });

  it('shows a pre-S78 roster without rating columns and an S78 roster with them', () => {
    renderTab('?tab=players&view=season&season=13');
    expect(bodyRows().map(r => r.slice(0, 3)).sort()).toEqual(['Ann', 'Bo ']);
    expect(screen.queryByText('Rtg')).toBeNull();
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '78' } });
    expect(screen.getByText('Rtg')).toBeTruthy();
    const row = within(screen.getAllByRole('row')[1]);
    expect(row.getByText('Cy Cole')).toBeTruthy();
    expect(row.getByText('88')).toBeTruthy();
  });

  it('switches views with the buttons and lists only seasons the franchise existed', () => {
    renderTab();
    expect(screen.getByRole('button', { name: 'All-time' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'By season' }));
    expect(screen.getByRole('button', { name: 'By season' }).getAttribute('aria-pressed')).toBe('true');
    const options = within(screen.getByLabelText('Season')).getAllByRole('option');
    expect(options[0].textContent).toBe('S1');
    expect(options[options.length - 1].textContent).toBe('S79');
  });

  it('says so when a season has nobody recorded', () => {
    renderTab('?tab=players&view=season&season=2');
    expect(screen.getByText('No players recorded for this season.')).toBeTruthy();
  });
});
