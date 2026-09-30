// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayersFile, SummaryFile, Team, TeamsFile } from '../../engine/shared/types';
import { SeasonHistoryPage } from './SeasonHistoryPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = {
  nextId: 4,
  players: {
    p00001: { id: 'p00001', name: 'Cameron Lučić', birthSeason: 40 },
    p00002: { id: 'p00002', name: 'Ray Allen', birthSeason: 41 },
    p00003: { id: 'p00003', name: 'Sam Nobody', birthSeason: 42 },
  },
};

const team = (teamId: string, name: string, abbr: string): Team => ({ teamId, name, abbr, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const fbaTeams: TeamsFile = { league: 'fba', teams: [team('BOS', 'Boston', 'BOS'), team('UTA', 'Utah', 'UTA')] };
const d2Teams: TeamsFile = { league: 'fbad2', teams: [team('AAA', 'Alpha', 'ALP')] };

const side = (name: string, seed: number | null) => ({ name, record: null, seed });
const s72: SummaryFile = {
  league: 'fba', season: 72, locked: true, host: null,
  champions: [{ title: 'FBA Champion', champion: 'Utah', runnerUp: 'Boston', score: '4-3', finalsMvp: 'p00002' }],
  awards: [{ award: 'MVP', playerId: 'p00002', teamId: 'UTA' }],
  allFba: {
    team1: [
      { slot: 'OUT', playerId: 'p00001', teamId: 'BOS' }, { slot: 'MID', playerId: 'p00002', teamId: 'UTA' },
      { slot: 'M2', playerId: null, teamId: null }, { slot: 'IN', playerId: 'p00003', teamId: 'UTA' },
    ],
    team2: [
      { slot: 'OUT', playerId: null, teamId: null }, { slot: 'MID', playerId: null, teamId: null },
      { slot: 'M2', playerId: null, teamId: null }, { slot: 'IN', playerId: null, teamId: null },
    ],
  },
  pastBracket: {
    rounds: 2,
    series: [
      { id: 'R1-1', round: 1, home: side('Utah', 1), away: side('Alpha', 4), homeWins: 4, awayWins: 1, winner: 'home' },
      { id: 'R1-2', round: 1, home: side('Boston', 2), away: side('Gamma', 3), homeWins: 4, awayWins: 2, winner: 'home' },
      { id: 'R2-1', round: 2, home: side('Utah', 1), away: side('Boston', 2), homeWins: 4, awayWins: 3, winner: 'home' },
    ],
  },
};
const standing = (teamId: string, name: string, group: string, rank: number, w: number, l: number, confW: number | null, confL: number | null) => ({
  teamId, name, group, rank, w, l, confW, confL, diff: confW === null ? null : 5, marker: null, seed: confW === null ? null : rank, playoff: null,
});
const s79: SummaryFile = {
  league: 'fba', season: 79, locked: true, host: null,
  champions: [{ title: 'FBA Champion', champion: 'Boston', runnerUp: 'Utah', score: '4-1', finalsMvp: null }],
  standings: [standing('BOS', 'Boston', 'E', 1, 50, 32, 30, 22), standing('UTA', 'Utah', 'W', 1, 0, 0, 0, 0)],
  bracket: {
    seeds: [],
    series: [{ id: 'FINALS', group: null, round: 4, home: 'BOS', away: 'UTA', homeSeed: 1, awaySeed: 1, homeWins: 4, awayWins: 1, winner: 'BOS', next: null }],
  },
};

function stub(seasons: SummaryFile[] = [s72, s79]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fba') return new Response(JSON.stringify({ seasons, errors: [] }));
    const docs: Record<string, unknown> = {
      '/api/state/players.json': players,
      '/api/state/leagues/fba/teams.json': fbaTeams,
      '/api/state/leagues/fbad2/teams.json': d2Teams,
    };
    if (url in docs) return new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } });
    return new Response('{}', { status: 404 });
  }));
}

function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/history/fba/season/:season" element={<SeasonHistoryPage />} /></Routes>
      <Where />
    </MemoryRouter>,
  );
}

describe('SeasonHistoryPage', () => {
  it('imported S72: no standings, a PastBracket with a won box, the OUT slot label', async () => {
    stub();
    const { container } = renderAt('/history/fba/season/72');
    expect(await screen.findByRole('heading', { name: 'Utah' })).toBeTruthy();
    expect(screen.getByText('No standings recorded')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Playoffs' }));
    expect(container.querySelectorAll('.bracket .series-side.won').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.bracket button')).toHaveLength(0);
    expect(screen.getByText('Finals MVP:')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ray Allen' }).getAttribute('href')).toBe('/history/fba/players/p00002');
    fireEvent.click(screen.getByRole('tab', { name: 'Awards' }));
    expect(screen.getAllByText('OUT')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Cameron Lučić' })).toBeTruthy();
    expect(screen.getByText(/MVP:/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'All-Star' }));
    expect(screen.getByText('No All-Star results recorded')).toBeTruthy();
  });

  it('app S79: the standings show Conf, and the playoffs render the app Bracket with no buttons', async () => {
    stub();
    const { container } = renderAt('/history/fba/season/79');
    expect(await screen.findByRole('heading', { name: 'Boston' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader', { name: 'Conf' })).toHaveLength(2);
    expect(screen.getByText('30-22')).toBeTruthy();
    expect(screen.getByText('0.610')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Eastern Conference' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Western Conference' })).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Playoffs' }));
    expect(container.querySelectorAll('.bracket .series-box')).toHaveLength(1);
    expect(container.querySelectorAll('.bracket button')).toHaveLength(0);
  });

  it('shows a Finals card without a bracket', async () => {
    stub([{ ...s72, pastBracket: null, confChampions: { E: 'Boston', W: 'Utah' } }]);
    const { container } = renderAt('/history/fba/season/72');
    await screen.findByRole('heading', { name: 'Utah' });
    fireEvent.click(screen.getByRole('tab', { name: 'Playoffs' }));
    const won = container.querySelector('.finals-only .series-side.won');
    expect(won?.textContent).toContain('Utah');
    expect(won?.querySelector('.wins')?.textContent).toBe('4');
    expect(container.querySelector('.finals-only .series-side:not(.won) .wins')?.textContent).toBe('3');
    expect(screen.getByText("The full bracket for S72 wasn't recorded.")).toBeTruthy();
    expect(screen.getByText(/Finals MVP:/)).toBeTruthy();
  });

  it('the picker navigates to the chosen season', async () => {
    stub();
    renderAt('/history/fba/season/72');
    const select = await screen.findByLabelText('Season');
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['S79', 'S72']);
    fireEvent.change(select, { target: { value: '79' } });
    expect(screen.getByTestId('where').textContent).toBe('/history/fba/season/79');
    expect(await screen.findByRole('heading', { name: 'Boston' })).toBeTruthy();
  });

  it('shows Not found for an unknown season', async () => {
    stub();
    renderAt('/history/fba/season/999');
    expect(await screen.findByText('Not found')).toBeTruthy();
  });
});
