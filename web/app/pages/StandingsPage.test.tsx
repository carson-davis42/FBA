// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullD2State, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import { d2SeasonState, fbaSeasonState } from '../../engine/season/testFixtures';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { StandingsPage } from './StandingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/standings" element={<StandingsPage />} /></Routes>
  </MemoryRouter>,
);

describe('StandingsPage', () => {
  it('lists each FBA conference in standings order with records', async () => {
    const s = fbaSeasonState();
    const games = [
      { gameNo: 1, home: 'CAR', away: 'BOS', homePts: 70, awayPts: 60 },
      { gameNo: 2, home: 'DEN', away: 'MEM', homePts: 50, awayPts: 80 },
    ];
    stubApi(seasonDocs({ ...s, results: { ...s.results!, games } }));
    renderAt('/league/fba/standings');
    const tables = await screen.findAllByRole('table');
    const east = within(tables[0]).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(east[0]).toContain('CAR Club');
    expect(east[0]).toContain('1-0');
    expect(east[1]).toContain('BOS Club');
  });

  it('shows one table per D2 league', async () => {
    stubApi(seasonDocs(d2SeasonState()));
    renderAt('/league/fbad2/standings');
    expect((await screen.findAllByRole('table'))).toHaveLength(2);
  });

  it('shows promotion/relegation as clinch bars with a key, not letter markers', async () => {
    const s = regularSeasonDone(fullD2State());
    stubApi(seasonDocs(s));
    renderAt('/league/fbad2/standings');
    const key = await screen.findByRole('list', { name: 'Standings key' });
    expect(key.textContent).toContain('Relegated');
    expect(screen.getAllByRole('img', { name: 'Relegated' }).length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText(/▼/)).toBeNull();
  });
});
