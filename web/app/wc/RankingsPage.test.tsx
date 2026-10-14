// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RankingsPage } from './RankingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const badge = { bg: '#112233', fg: '#ffffff' };
const team = (teamId: string, name: string) => ({ teamId, name, abbr: teamId, group: null, logoFolder: null, badge });
const entry = (position: string, rating: number, playerId: string | null = 'p1') => ({ playerId, position, rating, age: 25, points: 0 });
const roster = (r: number, generated = false) => ['PG', 'SG', 'SF', 'PF', 'C'].map(p => entry(p, r, generated ? null : 'p1'));

function stub(docs: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url in docs
    ? new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } }) : new Response('{}', { status: 404 }))));
}
const open = () => render(<MemoryRouter><RankingsPage /></MemoryRouter>);

describe('World Cup rankings', () => {
  it('ranks every country by its rating from the latest rosters', async () => {
    stub({
      '/api/state/meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
      '/api/state/leagues/fbawc/teams.json': { league: 'fbawc', teams: [team('ARG', 'Argentina'), team('BRA', 'Brazil'), team('FRA', 'France')] },
      '/api/state/leagues/fbawc/S79/rosters.json': { league: 'fbawc', season: 79, locked: false, teams: { ARG: roster(70), BRA: roster(80), FRA: roster(66, true) } },
    });
    open();
    expect(await screen.findByRole('heading', { name: 'Rankings' })).toBeTruthy();
    const rows = (await screen.findAllByRole('row')).slice(1).map(r => [...within(r).getAllByRole('cell')].map(c => c.textContent));
    expect(rows).toEqual([
      ['1', 'BRABrazil', '80.0', '80', '80', '80', '80', '80', ''],
      ['2', 'ARGArgentina', '70.0', '70', '70', '70', '70', '70', ''],
      ['3', 'FRAFrance', '66.0', '66', '66', '66', '66', '66', '5'],
    ]);
    expect(screen.getByText(/S79 rosters · 3 countries/)).toBeTruthy();
  });

  it('says so when there are no rosters yet', async () => {
    stub({
      '/api/state/meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
      '/api/state/leagues/fbawc/teams.json': { league: 'fbawc', teams: [team('ARG', 'Argentina')] },
    });
    open();
    expect(await screen.findByText(/No World Cup rosters yet/)).toBeTruthy();
  });
});
