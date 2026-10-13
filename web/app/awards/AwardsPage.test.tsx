// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockAllFba, lockAwards, setAward, startAllFba, startAwards } from '../../engine/awards/awardMoves';
import { races } from '../../engine/awards/races';
import { lockSeeds } from '../../engine/playoffs/moves';
import { fullD2State, fullFbaState, playPlayoffs, regularSeasonDone } from '../../engine/playoffs/testFixtures';
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

  it('clicking a player in a race list makes him the current, unlocked winner', async () => {
    const s = ready();
    const started = ok(startAwards(s, { ...s.rosters, season: 78 })).state;
    const log = stubApi(fbaDocs(started));
    renderAt('/league/fba/awards');
    const mvp = (await screen.findByRole('combobox', { name: 'MVP' })) as HTMLSelectElement;
    const third = mvp.options[3].value;
    const card = screen.getByRole('heading', { name: 'MVP' }).closest('.race-card') as HTMLElement;
    const row = within(card).getAllByRole('row')[3]; // header, #1, #2, #3
    fireEvent.click(row);
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0].path).toBe('leagues/fba/S79/awards.json');
    await waitFor(() => expect(mvp.value).toBe(third));
    expect(within(row).getByText('Selected')).toBeTruthy();
    // the awards are still a draft: nothing was locked
    expect(screen.getByRole('button', { name: 'Lock awards' })).toBeTruthy();
  });

  it('race rows are not clickable before the awards are started', async () => {
    const log = stubApi(fbaDocs(ready()));
    renderAt('/league/fba/awards');
    const card = (await screen.findByRole('heading', { name: 'MVP' })).closest('.race-card') as HTMLElement;
    fireEvent.click(within(card).getAllByRole('row')[2]);
    await new Promise(r => setTimeout(r, 30));
    expect(log.puts).toHaveLength(0);
    expect(log.batches).toHaveLength(0);
  });

  it('shows the winners once locked, with the All-FBA teams waiting for the playoffs', async () => {
    const s = ready();
    const locked = ok(lockAwards(ok(startAwards(s, { ...s.rosters, season: 78 })).state, { ...s.rosters, season: 78 }, { batchId: 'a' })).state;
    stubApi(fbaDocs(locked));
    renderAt('/league/fba/awards');
    expect(await screen.findByRole('heading', { name: 'S79 FBA award winners' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'All-FBA teams' })).toBeTruthy();
    expect(screen.getByText('The All-FBA teams are picked after the playoffs.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lock awards' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suggest All-FBA teams' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /^All-FBA/ })).toBeNull();
  });

  it('says the All-FBA teams come after the playoffs while the awards are still a draft, with no pickers', async () => {
    const s = ready();
    stubApi(fbaDocs(ok(startAwards(s, { ...s.rosters, season: 78 })).state));
    renderAt('/league/fba/awards');
    expect(await screen.findByRole('combobox', { name: 'MVP' })).toBeTruthy();
    expect(screen.getByText('The All-FBA teams are picked after the playoffs.')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: /^All-FBA/ })).toBeNull();
  });

  describe('after the playoffs', () => {
    const last = (s: SeasonState) => ({ ...s.rosters, season: 78 });
    const played = () => {
      const s = ready();
      const locked = ok(lockAwards(ok(startAwards(s, last(s))).state, last(s), { batchId: 'a' })).state;
      return playPlayoffs(ok(lockSeeds(locked)).state, 5);
    };

    it('suggests the teams, then locks them in one batch with the transaction', async () => {
      const s = played();
      const log = stubApi(fbaDocs(s));
      renderAt('/league/fba/awards');
      expect(await screen.findByRole('heading', { name: 'All-FBA teams' })).toBeTruthy();
      expect(screen.queryByText('The All-FBA teams are picked after the playoffs.')).toBeNull();
      expect((screen.getByRole('button', { name: 'Lock All-FBA teams' }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Suggest All-FBA teams' }));
      await waitFor(() => expect(log.batches).toHaveLength(1));
      expect(log.batches[0].label).toBe('Suggest S79 All-FBA teams');
      expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/awards.json']);
      expect(await screen.findByRole('combobox', { name: 'All-FBA 1st team G' })).toBeTruthy();
      const lock = screen.getByRole('button', { name: 'Lock All-FBA teams' }) as HTMLButtonElement;
      await waitFor(() => expect(lock.disabled).toBe(false));
      fireEvent.click(lock);
      await waitFor(() => expect(log.batches).toHaveLength(2));
      expect(log.batches[1].label).toBe('Lock S79 All-FBA teams');
      expect(log.batches[1].writes.map(w => w.path).sort()).toEqual(['leagues/fba/S79/awards.json', 'leagues/fba/S79/transactions.json']);
    });

    it('shows the locked teams read-only', async () => {
      const s = played();
      const drafted = ok(startAllFba(s, last(s))).state;
      const locked = ok(lockAllFba(drafted, last(s), { batchId: 'b' })).state;
      stubApi(fbaDocs(locked));
      renderAt('/league/fba/awards');
      expect(await screen.findByRole('heading', { name: 'All-FBA teams' })).toBeTruthy();
      expect(screen.getAllByText('All-FBA').length).toBe(2);
      expect(screen.queryByRole('button', { name: 'Lock All-FBA teams' })).toBeNull();
      expect(screen.queryByRole('combobox', { name: /^All-FBA/ })).toBeNull();
    });
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
