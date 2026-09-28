// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAward, startAwards } from '../../engine/awards/awardMoves';
import { races } from '../../engine/awards/races';
import { fullD2State, fullFbaState, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import type { SeasonResult, SeasonState } from '../../engine/season/state';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { AwardsPage } from './AwardsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
function withBoxes(s: SeasonState): SeasonState {
  const games = s.results!.games.map(g => ({
    ...g,
    box: {
      home: s.rosters.teams[g.home].map(e => ({ playerId: e.playerId!, pts: 20, def: 10, stops: 5, allowed: 10, exp: 1000 })),
      away: s.rosters.teams[g.away].map(e => ({ playerId: e.playerId!, pts: 18, def: 10, stops: 4, allowed: 12, exp: 1000 })),
    },
  }));
  return { ...s, results: { ...s.results!, games } };
}
const ready = () => withBoxes(regularSeasonDone(fullFbaState(), 3, { awardsOpen: true }));
/** The season docs plus last season's FBA roster, which the ROTY and MIP races need. */
const fbaDocs = (s: SeasonState) => ({ ...seasonDocs(s), 'leagues/fba/S78/rosters.json': { ...s.rosters, season: 78 } });
const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/awards" element={<AwardsPage />} /></Routes>
  </MemoryRouter>,
);

describe('AwardsPage', () => {
  it('shows live races read-only during the season', async () => {
    const s = fullFbaState();
    stubApi(fbaDocs({ ...s, results: ready().results!, schedule: { ...s.schedule!, games: [...s.schedule!.games, { gameNo: 9999, home: 'E01', away: 'E02' }] } }));
    renderAt('/league/fba/awards');
    expect(await screen.findByText(/^The awards are decided after game 1291/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'MVP' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start awards' })).toBeNull();
  });

  it('starts the awards step as one awards.json batch', async () => {
    const log = stubApi(fbaDocs(ready()));
    renderAt('/league/fba/awards');
    fireEvent.click(await screen.findByRole('button', { name: 'Start awards' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start S79 FBA awards');
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/awards.json']);
  });

  it('autosaves a changed pick and locks the awards', async () => {
    const s = ready();
    const started = ok(startAwards(s, { ...s.rosters, season: 78 })).state;
    const log = stubApi(fbaDocs(started));
    renderAt('/league/fba/awards');
    const mvp = (await screen.findByRole('combobox', { name: 'MVP' })) as HTMLSelectElement;
    const second = mvp.options[2].value;
    fireEvent.change(mvp, { target: { value: second } });
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0].path).toBe('leagues/fba/S79/awards.json');
    const lock = screen.getByRole('button', { name: 'Lock awards' }) as HTMLButtonElement;
    await waitFor(() => expect(lock.disabled).toBe(false));
    fireEvent.click(lock);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Lock S79 FBA awards');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual(['leagues/fba/S79/awards.json', 'leagues/fba/S79/transactions.json']);
  });

  it('shows the winners once locked', async () => {
    const started = ok(startAwards(ready(), null)).state;
    stubApi(fbaDocs({ ...started, awards: { ...started.awards!, locked: true } }));
    renderAt('/league/fba/awards');
    expect(await screen.findByRole('heading', { name: 'S79 FBA award winners' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'All-FBA teams' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lock awards' })).toBeNull();
  });

  it("warns and disables Start awards when last season's FBA roster is missing", async () => {
    stubApi(seasonDocs(ready()));
    renderAt('/league/fba/awards');
    expect(await screen.findByText("Last season's FBA roster (leagues/fba/S78/rosters.json) couldn't be loaded, so ROTY and MIP can't be decided.")).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Start awards' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables Lock awards while last season's FBA roster is missing", async () => {
    const started = ok(startAwards(ready(), null)).state;
    stubApi(seasonDocs(started));
    renderAt('/league/fba/awards');
    expect(await screen.findByText(/Last season's FBA roster/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Lock awards' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an ineligible pick as "(not eligible)" in its picker', async () => {
    const s = ready();
    const started = ok(startAwards(s, { ...s.rosters, season: 78 })).state;
    const ppk = races(started, { ...s.rosters, season: 78 }).find(r => r.award === 'PPK')!.rows[0];
    const bad = { ...started, awards: setAward(started.awards!, 'MC', ppk.playerId, ppk.teamId) };
    stubApi(fbaDocs(bad));
    renderAt('/league/fba/awards');
    const mc = (await screen.findByRole('combobox', { name: 'MC Award' })) as HTMLSelectElement;
    expect(mc.value).toBe(ppk.playerId);
    expect(mc.selectedOptions[0].textContent).toMatch(/\(not eligible\)$/);
  });

  it('has four league MVP pickers for the D2', async () => {
    const s = withBoxes(regularSeasonDone(fullD2State(), 3, { awardsOpen: true }));
    stubApi(seasonDocs(ok(startAwards(s, null)).state));
    renderAt('/league/fbad2/awards');
    expect(await screen.findByRole('combobox', { name: 'Premier League MVP' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'International League MVP' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'All-FBA teams' })).toBeNull();
  });
});
