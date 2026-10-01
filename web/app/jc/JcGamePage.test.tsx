// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { playPostRound } from '../../engine/jc/postseason';
import { startConfTournaments } from '../../engine/jc/confTourney';
import { jcPlayedFixture, jcReadyForNit, jcStateFixture } from '../../engine/jc/testFixtures';
import type { JcState } from '../../engine/jc/state';
import { JcGamePage } from './JcGamePage';
import { docsOf } from './postseasonTestDocs';

let batches: { writes: { path: string }[] }[] = [];
let ready: JcState;
let oneRound: JcState;
let confStarted: JcState;
beforeAll(() => {
  ready = jcReadyForNit();
  const r = playPostRound(ready, 'nit', mulberry32(4));
  if (!r.ok) throw new Error(r.problems.join());
  oneRound = r.state;
  const c = startConfTournaments(jcPlayedFixture());
  if (!c.ok) throw new Error(c.problems.join());
  confStarted = c.state;
}, 300000);

function mount(s: JcState, gameNo: number) {
  batches = [];
  const docs = docsOf(s);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') {
      batches.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ batchId: 'b1', versions: {} }), { status: 200 });
    }
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(
    <MemoryRouter initialEntries={[`/league/fbajc/game/${gameNo}`]}>
      <Routes><Route path="/league/fbajc/game/:gameNo" element={<JcGamePage />} /></Routes>
    </MemoryRouter>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('JcGamePage', () => {
  it('shows a played NIT game with its round, line score and box score', async () => {
    const first = oneRound.postseason!.nit!.games.find(g => g.result)!;
    mount(oneRound, first.result!.gameNo);
    expect(await screen.findByText(/NIT · Round of 32/)).toBeTruthy();
    expect(screen.getByText(/FBAJC · S79 · Game/)).toBeTruthy();
    expect(document.querySelectorAll('table.box-score').length).toBe(2);
    expect(screen.getByRole('link', { name: /Back to the postseason/ })).toBeTruthy();
  });

  it('shows a regular-season game with a link back to the scores', async () => {
    mount(oneRound, 1);
    expect(await screen.findByText(/Game 1/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Back to scores/ })).toBeTruthy();
    expect(screen.queryByText(/NIT/)).toBeNull();
  });

  it('watches the next NIT game live and saves it once at the final buzzer', async () => {
    mount(ready, ready.postseason!.nextGameNo);
    fireEvent.click(await screen.findByRole('button', { name: 'Sim to end' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes.map(w => w.path).sort()).toEqual(['leagues/fbajc/S79/postseason.json', 'leagues/fbajc/S79/rosters.json']);
    expect(await screen.findByRole('link', { name: /Saved/ })).toBeTruthy();
  });

  it("says so for a game that hasn't been played and isn't next", async () => {
    mount(ready, ready.postseason!.nextGameNo + 3);
    expect(await screen.findByText(/hasn't been played, and it isn't up next/)).toBeTruthy();
    cleanup();
    mount(ready, 0);
    expect(await screen.findByText(/There is no such game/)).toBeTruthy();
  });

  it('lets the NIT game be watched only once every award is picked', async () => {
    mount(ready, ready.postseason!.nextGameNo);
    expect(await screen.findByRole('button', { name: 'Auto' })).toBeTruthy();
    cleanup();
    const noAwards = { ...ready, awards: { ...ready.awards!, mvp: ready.awards!.mvp, national: ready.awards!.national.map((a, i) => (i === 0 ? { ...a, playerId: null } : a)) } };
    mount(noAwards, noAwards.postseason!.nextGameNo);
    expect(await screen.findByText(/hasn't been played, and it isn't up next/)).toBeTruthy();
  });

  it('watches the next regular-season game live, saves results and rosters, and links back to the scores', async () => {
    mount(jcStateFixture(), 1);
    fireEvent.click(await screen.findByRole('button', { name: 'Sim to end' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes.map(w => w.path).sort()).toEqual(['leagues/fbajc/S79/results.json', 'leagues/fbajc/S79/rosters.json']);
    const saved = await screen.findByRole('link', { name: /Saved/ });
    expect(saved.getAttribute('href')).toBe('/league/fbajc/scores');
  });

  it("does not let a later regular-season game be watched before the one before it", async () => {
    mount(jcStateFixture(), 2);
    expect(await screen.findByText(/hasn't been played, and it isn't up next/)).toBeTruthy();
  });

  it('watches the next conference tournament game live', async () => {
    mount(confStarted, 3133);
    fireEvent.click(await screen.findByRole('button', { name: 'Sim to end' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes.map(w => w.path).sort()).toEqual(['leagues/fbajc/S79/postseason.json', 'leagues/fbajc/S79/rosters.json']);
  });
});
