// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SummaryFile, TeamsFile } from '../../../engine/shared/types';
import { HistoryLeagueSwitch } from '../d2/HistoryLeagueSwitch';
import { JcHistoryHome } from './JcHistoryHome';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const teams: TeamsFile = {
  league: 'fbajc',
  teams: [{ teamId: 'UNC', name: 'North Carolina', abbr: 'UNC', group: 'ACC', logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } }],
};
const sum = (season: number, champion: string, teamId?: string): SummaryFile => ({
  league: 'fbajc', season, locked: true, host: null,
  champions: [{ title: 'National Champion', champion, runnerUp: 'Duke', score: null, ...(teamId ? { teamId } : {}) }],
});

function stub(seasons: SummaryFile[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fbajc') return new Response(JSON.stringify({ league: 'fbajc', seasons, errors: [] }));
    if (url === '/api/state/leagues/fbajc/teams.json') return new Response(JSON.stringify(teams), { headers: { ETag: '"0000000000000001"' } });
    return new Response('{}', { status: 404 });
  }));
}

describe('HistoryLeagueSwitch', () => {
  const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><HistoryLeagueSwitch /></MemoryRouter>);
  it('shows the four leagues and links College to the college history', () => {
    at('/history');
    expect(screen.getAllByRole('link').map(a => a.textContent)).toEqual(['FBA', 'D2', 'College', 'World Cup']);
    expect(screen.getByRole('link', { name: 'College' }).getAttribute('href')).toBe('/history/fbajc');
  });
  it.each([['/history', 'FBA'], ['/history/fba/awards', 'FBA'], ['/history/fbad2/teams', 'D2'], ['/history/fbajc/schools/UNC', 'College'], ['/history/fbawc', 'World Cup']])('marks the chip for %s', (path, label) => {
    at(path);
    expect(screen.getByRole('link', { current: 'page' }).textContent).toBe(label);
  });
});

describe('JcHistoryHome', () => {
  it('links the sections and lists the seasons newest first, with the latest champion', async () => {
    stub([sum(12, 'Duke'), sum(78, 'North Carolina', 'UNC')]);
    const { container } = render(<MemoryRouter><JcHistoryHome /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'History' })).toBeTruthy();
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Championships')).toBe('/history/fbajc/championships');
    expect(href('Awards')).toBe('/history/fbajc/awards');
    expect(href('Seasons')).toBe('/history/fbajc/season/78');
    expect(href('Schools')).toBe('/history/fbajc/schools');
    expect([...container.querySelectorAll('.chips .chip')].map(c => c.textContent).slice(-2)).toEqual(['S78', 'S12']);
    expect(screen.getByRole('link', { name: 'North Carolina' }).getAttribute('href')).toBe('/history/fbajc/schools/UNC');
  });

  it('renders without any seasons', async () => {
    stub([]);
    render(<MemoryRouter><JcHistoryHome /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'History' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Seasons' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Schools' })).toBeTruthy();
  });
});
