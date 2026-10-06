// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameResult } from '../../engine/shared/types';
import { StreaksPage } from './StreaksPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mkTeam = (teamId: string, name: string) => ({ teamId, name, abbr: teamId, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams = { league: 'fba', teams: [mkTeam('CGG', 'Cypress Green Guns'), mkTeam('BOS', 'Boston Bucks'), mkTeam('CHI', 'Chicago Spartans')] };
const franchises = { franchises: [
  { teamId: 'CGG', eras: [{ name: 'Cypress Green Guns', abbr: 'CGG', city: 'Cypress', from: 1, to: null }] },
  { teamId: 'BOS', eras: [{ name: 'Boston Bucks', abbr: 'BOS', city: 'Boston', from: 1, to: null }] },
  { teamId: 'CHI', eras: [{ name: 'Chicago Spartans', abbr: 'CHI', city: 'Chicago', from: 1, to: null }] },
] };
const records = { records: [
  { teamId: 'CGG', name: 'Cypress Green Guns', kind: 'W', length: 50, fromSeason: 33, toSeason: 38 },
  { teamId: 'CHI', name: 'Chicago Spartans', kind: 'L', length: 21, fromSeason: 50, toSeason: 53 },
] };
let n = 0;
const game = (home: string, away: string, homeWins: boolean): GameResult => ({ gameNo: ++n, home, away, homePts: homeWins ? 80 : 70, awayPts: homeWins ? 70 : 80 });

function stub(extra: Record<string, unknown> = {}) {
  n = 0;
  const bosWins = Array.from({ length: 30 }, () => game('BOS', 'CHI', true));
  const docs: Record<string, unknown> = {
    '/api/state/meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    '/api/state/leagues/fba/teams.json': teams,
    '/api/state/leagues/fba/franchises.json': franchises,
    '/api/state/leagues/fba/streakRecords.json': records,
    '/api/state/leagues/fba/S79/results.json': { league: 'fba', season: 79, locked: false, games: bosWins },
    ...extra,
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url in docs ? new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } }) : new Response('{}', { status: 404 }))));
}
const render_ = () => render(<MemoryRouter><StreaksPage /></MemoryRouter>);
const rowsOf = (title: string) => [...screen.getByRole('heading', { name: title }).parentElement!.querySelectorAll('tbody tr')].map(r => r.textContent!.replace(/\s+/g, ' ').trim());

describe('StreaksPage', () => {
  it('lists recorded and tracked streaks together, longest first, with the active one flagged', async () => {
    stub();
    render_();
    await screen.findByRole('heading', { name: 'Longest winning streaks' });
    const wins = rowsOf('Longest winning streaks');
    expect(wins[0]).toContain('Cypress Green Guns');
    expect(wins[0]).toContain('50');
    expect(wins[0]).toContain('S33–S38');
    expect(wins[1]).toContain('Boston Bucks');
    expect(wins[1]).toContain('30');
    expect(wins[1]).toContain('S79');
    expect(wins[1]).toContain('Active');
    // Chicago lost all 30 of those games, which outranks its recorded 21.
    const losses = rowsOf('Longest losing streaks');
    expect(losses[0]).toContain('Chicago Spartans');
    expect(losses[0]).toContain('30');
    expect(losses[0]).toContain('Active');
    expect(losses[1]).toContain('21');
    expect(losses[1]).toContain('S50–S53');
  });

  it('shows the current streaks and counts playoff games in a streak', async () => {
    const playoffs = { league: 'fba', season: 79, locked: false, seeds: [], series: [], queue: [], outcome: null, games: [
      { ...game('BOS', 'CHI', true), seriesId: 'R1-1', gameInSeries: 1 }, { ...game('BOS', 'CHI', true), seriesId: 'R1-1', gameInSeries: 2 },
    ] };
    stub({ '/api/state/leagues/fba/S79/playoffs.json': playoffs });
    render_();
    await screen.findByRole('heading', { name: 'Current streaks' });
    const chips = screen.getByRole('heading', { name: 'Current streaks' }).parentElement!;
    expect(within(chips).getByText('BOS W32')).toBeTruthy();
    expect(within(chips).getByText('CHI L32')).toBeTruthy();
    expect(rowsOf('Longest winning streaks')[1]).toContain('includes 2 playoff games');
  });

  it('still lists the recorded streaks when no season has game results yet', async () => {
    stub({ '/api/state/leagues/fba/S79/results.json': { league: 'fba', season: 79, locked: false, games: [] } });
    render_();
    await screen.findByRole('heading', { name: 'Longest winning streaks' });
    expect(rowsOf('Longest winning streaks')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Current streaks' })).toBeNull();
  });
});
