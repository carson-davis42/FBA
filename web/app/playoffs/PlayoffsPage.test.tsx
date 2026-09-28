// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockSeeds } from '../../engine/playoffs/moves';
import { fullD2State, fullFbaState, playPlayoffs, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import type { SeasonResult } from '../../engine/season/state';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { PlayoffsPage } from './PlayoffsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/playoffs" element={<PlayoffsPage />} /></Routes>
  </MemoryRouter>,
);

describe('PlayoffsPage', () => {
  it('shows projected seeds during the regular season, with no Lock button', async () => {
    stubApi(seasonDocs(fullFbaState()));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByText('Playoffs start after game 1290. Projected seeds from the current standings:')).toBeTruthy();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(16);
    expect(screen.queryByRole('button', { name: 'Lock seeds' })).toBeNull();
  });

  it('sends you to the rating pause after game 1290 first', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullFbaState(), 3, { lastPauseOpen: true })));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByRole('link', { name: 'Adjust ratings ▸' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lock seeds' })).toBeNull();
  });

  it('locks the seeds as one playoffs.json batch', async () => {
    const log = stubApi(seasonDocs(regularSeasonDone(fullFbaState())));
    renderAt('/league/fba/playoffs');
    fireEvent.click(await screen.findByRole('button', { name: 'Lock seeds' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Lock S79 FBA playoff seeds');
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/playoffs.json']);
  });

  it('shows the next game card and the bracket once seeded', async () => {
    const state = ok(lockSeeds(regularSeasonDone(fullFbaState()))).state;
    stubApi(seasonDocs(state));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByText(/^Playoff game 1 · East first round, game 1/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch ▸' }).getAttribute('href')).toBe('/league/fba/playoffs/game/1');
    const a = state.playoffs!.seeds[0].teams[0];
    const b = state.playoffs!.seeds[0].teams[7];
    expect(screen.getByRole('button', { name: new RegExp(`${a}.*${b}|${b}.*${a}`) })).toBeTruthy();
    expect(screen.getAllByText('TBD').length).toBeGreaterThan(0);
  });

  it('shows the champion when the FBA Finals are over', async () => {
    const done = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullFbaState()))).state, 5);
    stubApi(seasonDocs(done));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByText(/^S79 FBA Champions: /)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Watch ▸' })).toBeNull();
  });

  it('shows the four D2 champions and promotion and relegation when done', async () => {
    const done = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6);
    stubApi(seasonDocs(done));
    renderAt('/league/fbad2/playoffs');
    expect(await screen.findByText(/^S79 Premier League Champions: /)).toBeTruthy();
    expect(screen.getByText(/^S79 International League Champions: /)).toBeTruthy();
    expect(screen.getByText(/^World League: promoted /)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'IL' }));
    expect(screen.getAllByRole('button', { name: /IL0\d/ }).length).toBeGreaterThan(0);
  });

  it('sends you to the Awards step before Lock seeds', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullFbaState(), 3, { awardsOpen: true })));
    renderAt('/league/fba/playoffs');
    expect((await screen.findByRole('link', { name: 'Awards step ▸' })).getAttribute('href')).toBe('/league/fba/awards');
    expect(screen.queryByRole('button', { name: 'Lock seeds' })).toBeNull();
  });
});
