// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PastBracket, PlayersFile, SummaryFile, TeamsFile } from '../../../engine/shared/types';
import { D2SeasonPage } from './D2SeasonPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = { nextId: 1, players: {} };
const teams: TeamsFile = { league: 'fbad2', teams: [] };
const one = (a: string, b: string): PastBracket => ({
  rounds: 1,
  series: [{ id: 'R1-1', round: 1, home: { name: a, record: null, seed: 1 }, away: { name: b, record: null, seed: 2 }, homeWins: 4, awayWins: 1, winner: 'home' }],
});
const base = (season: number): SummaryFile => ({ league: 'fbad2', season, locked: true, host: null, champions: [], awards: [] });

const seasons: SummaryFile[] = [
  { ...base(60), pastBracket: one('Oldtown', 'Oldville') },
  // out of group order on purpose
  { ...base(70), pastBrackets: [{ group: 'WL', bracket: one('Wlteam', 'Wlrival') }, { group: 'PL', bracket: one('Plteam', 'Plrival') }] },
  { ...base(80), bracket: { series: [] } as unknown as SummaryFile['bracket'], pastBracket: one('Hidden', 'Hidden2') },
  base(90),
];

function stub() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fbad2') return new Response(JSON.stringify({ seasons, errors: [] }));
    if (url === '/api/state/players.json') return new Response(JSON.stringify(players), { headers: { ETag: '"0000000000000001"' } });
    if (url === '/api/state/leagues/fbad2/teams.json') return new Response(JSON.stringify(teams), { headers: { ETag: '"0000000000000002"' } });
    return new Response('{}', { status: 404 });
  }));
}
function renderSeason(n: number) {
  stub();
  return render(
    <MemoryRouter initialEntries={[`/history/fbad2/season/${n}`]}>
      <Routes><Route path="/history/fbad2/season/:season" element={<D2SeasonPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('D2 season Tournament section', () => {
  it('shows a single past bracket for an old-format season', async () => {
    const { container } = renderSeason(60);
    expect(await screen.findByRole('heading', { name: 'Tournament' })).toBeTruthy();
    expect(container.querySelectorAll('.bracket')).toHaveLength(1);
    expect(screen.getByText('Oldtown')).toBeTruthy();
  });

  it('shows one headed bracket per league in group order', async () => {
    const { container } = renderSeason(70);
    await screen.findByRole('heading', { name: 'Tournament' });
    const brackets = container.querySelectorAll('.bracket');
    expect(brackets).toHaveLength(2);
    expect(brackets[0].textContent).toContain('Plteam');
    expect(brackets[1].textContent).toContain('Wlteam');
    const h3 = [...container.querySelectorAll('h3')].map(h => h.textContent);
    expect(h3).toEqual(['Premier League', 'World League']);
  });

  it('leaves a live bracket season to the Playoffs block only', async () => {
    renderSeason(80);
    await screen.findByRole('heading', { name: 'Playoffs' });
    expect(screen.queryByRole('heading', { name: 'Tournament' })).toBeNull();
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('says so when nothing was recorded', async () => {
    renderSeason(90);
    expect(await screen.findByText('No bracket recorded')).toBeTruthy();
  });
});
