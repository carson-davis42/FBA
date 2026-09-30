// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalsMvpCandidates, lockSeeds, pickFinalsMvp } from '../../engine/playoffs/moves';
import { fullD2State, fullFbaState, pickAllFinalsMvps, playPlayoffs, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import type { SeasonResult } from '../../engine/season/state';
import { finishSeason } from '../../engine/season/wrapUp';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { groupLabel } from '../../engine/shared/leagues';
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

  it('finishes the D2 season as one batch that clears Undo, then says so', async () => {
    const done = pickAllFinalsMvps(playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6));
    const log = stubApi(seasonDocs(done));
    renderAt('/league/fbad2/playoffs');
    fireEvent.click(await screen.findByRole('button', { name: 'Finish S79 D2 season ▸' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0]).toMatchObject({ label: 'Finish S79 D2 season', resetUndo: true });
    expect(log.batches[0].writes.map(w => w.path)).toEqual([
      'leagues/fbad2/S79/summary.json', 'leagues/fbad2/S79/schedule.json', 'leagues/fbad2/S79/results.json',
      'leagues/fbad2/S79/playoffs.json', 'leagues/fbad2/S79/transactions.json', 'calendar.json',
    ]);
    expect(log.batches[0].writes[0].baseVersion).toBeNull();
    expect(await screen.findByText('The S79 D2 season is finished.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finish S79 D2 season ▸' })).toBeNull();
  });

  it('offers Finish for the FBA once the Finals are over, but not before', async () => {
    const seeded = ok(lockSeeds(regularSeasonDone(fullFbaState()))).state;
    const done = playPlayoffs(seeded, 5);
    stubApi(seasonDocs(done));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByRole('button', { name: 'Finish S79 FBA season ▸' })).toBeTruthy();
    cleanup();
    stubApi(seasonDocs(playPlayoffs(seeded, 5, done.playoffs!.games.length - 1)));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByRole('link', { name: 'Watch ▸' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Finish S79/ })).toBeNull();
  });

  it('shows a failed save with Retry, and Retry saves', async () => {
    const done = pickAllFinalsMvps(playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6));
    const log = stubApi(seasonDocs(done));
    const inner = globalThis.fetch;
    let failNext = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/batch' && failNext) {
        failNext = false;
        return new Response(JSON.stringify({ error: 'disk full' }), { status: 500 });
      }
      return inner(url, init);
    }));
    renderAt('/league/fbad2/playoffs');
    fireEvent.click(await screen.findByRole('button', { name: 'Finish S79 D2 season ▸' }));
    expect(await screen.findByText(/Save failed: disk full/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
  });

  it('shows a finished season as finished, with no Finish button', async () => {
    const done = pickAllFinalsMvps(playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6));
    stubApi(seasonDocs(ok(finishSeason(done, [], { batchId: 't' })).state));
    renderAt('/league/fbad2/playoffs');
    expect(await screen.findByText('The S79 D2 season is finished.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Finish S79/ })).toBeNull();
  });
});

describe('Finals MVP card', () => {
  const fbaDone = () => playPlayoffs(ok(lockSeeds(regularSeasonDone(fullFbaState()))).state, 5);

  it('lists the champion players by PPG and posts one batch per pick, even on a double click', async () => {
    const state = fbaDone();
    const cands = finalsMvpCandidates(state, null);
    const log = stubApi(seasonDocs(state));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByRole('heading', { name: 'Finals MVP' })).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(cands.length);
    expect(rows[0].textContent).toContain(cands[0].name);
    expect(rows[0].textContent).toContain(cands[0].ppg.toFixed(1));
    const picks = screen.getAllByRole('button', { name: 'Pick' });
    expect(picks).toHaveLength(cands.length);
    fireEvent.click(picks[1]);
    fireEvent.click(picks[1]);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Pick the Finals MVP');
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/playoffs.json']);
    const saved = log.batches[0].writes[0].doc as { outcome: { champions: { finalsMvp?: string }[] } };
    expect(saved.outcome.champions[0].finalsMvp).toBe(cands[1].playerId);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Pick' })).toHaveLength(cands.length - 1));
    expect(screen.getAllByText('Finals MVP').length).toBeGreaterThan(1);
    expect(log.batches).toHaveLength(1);
  });

  it('refuses Finish without a pick', async () => {
    stubApi(seasonDocs(fbaDone()));
    renderAt('/league/fba/playoffs');
    fireEvent.click(await screen.findByRole('button', { name: 'Finish S79 FBA season ▸' }));
    expect(await screen.findByText('Pick the Finals MVP first')).toBeTruthy();
  });

  it('shows one Series MVP card per D2 league champion', async () => {
    const state = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6);
    stubApi(seasonDocs(state));
    renderAt('/league/fbad2/playoffs');
    for (const c of state.playoffs!.outcome!.champions) {
      expect(await screen.findByRole('heading', { name: `${groupLabel('fbad2', c.group!)} Series MVP` })).toBeTruthy();
    }
    expect(screen.getAllByRole('heading', { name: /Series MVP$/ })).toHaveLength(4);
    expect(screen.getByRole('heading', { name: 'Premier League Series MVP' })).toBeTruthy();
  });

  it('shows only the MVP line once the season is finished', async () => {
    const picked = pickAllFinalsMvps(fbaDone());
    const name = picked.players.players[picked.playoffs!.outcome!.champions[0].finalsMvp!]?.name ?? 'Unnamed';
    stubApi(seasonDocs(ok(finishSeason(picked, [], { batchId: 't' })).state));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByText(`Finals MVP: ${name}`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pick' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows nothing after wrap-up when there was no pick', async () => {
    const picked = ok(pickFinalsMvp(fbaDone(), null, finalsMvpCandidates(fbaDone(), null)[0].playerId)).state;
    const finished = ok(finishSeason(picked, [], { batchId: 't' })).state;
    const bare = { ...finished, playoffs: { ...finished.playoffs!, outcome: { ...finished.playoffs!.outcome!, champions: finished.playoffs!.outcome!.champions.map(c => ({ ...c, finalsMvp: undefined })) } } };
    stubApi(seasonDocs(bare));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByText('The S79 FBA season is finished.')).toBeTruthy();
    expect(screen.queryByText(/Finals MVP/)).toBeNull();
  });
});
