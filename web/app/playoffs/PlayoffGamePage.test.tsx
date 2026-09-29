// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockSeeds } from '../../engine/playoffs/moves';
import { fullFbaState, playPlayoffs, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import type { SeasonResult } from '../../engine/season/state';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { PlayoffGamePage } from './PlayoffGamePage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const seeded = () => ok(lockSeeds(regularSeasonDone(fullFbaState()))).state;
const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/playoffs/game/:n" element={<PlayoffGamePage />} /></Routes>
  </MemoryRouter>,
);

describe('PlayoffGamePage', () => {
  it('plays the next game live and saves it once as a playoffs.json batch', async () => {
    const log = stubApi(seasonDocs(seeded()));
    renderAt('/league/fba/playoffs/game/1');
    expect(await screen.findByText(/^Playoff game 1 · East first round, game 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sim to end' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toMatch(/^Playoff game 1: /);
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/playoffs.json']);
    expect(await screen.findByRole('link', { name: 'Saved · back to the playoffs ▸' })).toBeTruthy();
  });

  it('shows a played game as a final', async () => {
    stubApi(seasonDocs(playPlayoffs(seeded(), 5, 1)));
    renderAt('/league/fba/playoffs/game/1');
    expect(await screen.findByText(/^Playoff game 1 · East first round, game 1/)).toBeTruthy();
    expect(await screen.findByText(/^Final/)).toBeTruthy();
    expect((await screen.findByRole('link', { name: 'Back to the playoffs ▸' })).getAttribute('href')).toBe('/league/fba/playoffs');
  });

  it('refuses any other game', async () => {
    stubApi(seasonDocs(seeded()));
    renderAt('/league/fba/playoffs/game/3');
    expect(await screen.findByText("This isn't the next playoff game.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next possession' })).toBeNull();
  });

  it('loads the game in the URL when it changes while the page is open', async () => {
    stubApi(seasonDocs(seeded()));
    render(
      <MemoryRouter initialEntries={['/league/fba/playoffs/game/1']}>
        <Link to="/league/fba/playoffs/game/3">go to 3</Link>
        <Routes><Route path="/league/:league/playoffs/game/:n" element={<PlayoffGamePage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: 'Sim to end' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'go to 3' }));
    expect(await screen.findByText("This isn't the next playoff game.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sim to end' })).toBeNull();
  });
});
