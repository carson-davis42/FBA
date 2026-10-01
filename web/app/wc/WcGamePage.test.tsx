// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { nextQualifyingGame, recordQualifyingGame } from '../../engine/wc/qualifying';
import { simWcGame } from '../../engine/wc/state';
import { runFullWorldCup } from '../../engine/wc/testRun';
import { nextGroupGame, recordGroupGame } from '../../engine/wc/worldcup';
import { WcGamePage } from './WcGamePage';

const teams = JSON.parse(readFileSync('data/leagues/fbawc/teams.json', 'utf8'));
let stages: ReturnType<typeof runFullWorldCup>['stages'];
let batches: { writes: { path: string }[] }[] = [];

beforeAll(() => { stages = runFullWorldCup(5).stages; }, 120000);

function mount(season: number, docs: Record<string, unknown>, gameNo: number) {
  batches = [];
  const all: Record<string, unknown> = { 'meta.json': { currentSeason: season }, 'leagues/fbawc/teams.json': teams, 'players.json': { nextId: 1, players: {} }, ...docs };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') {
      batches.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ batchId: 'b1', versions: {} }), { status: 200 });
    }
    const doc = all[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(
    <MemoryRouter initialEntries={[`/league/fbawc/game/${gameNo}`]}>
      <Routes><Route path="/league/fbawc/game/:gameNo" element={<WcGamePage />} /></Routes>
    </MemoryRouter>,
  );
}

const qDocs = (q: typeof stages.qStart) => ({
  'calendar.json': q.calendar, 'leagues/fbawc/S79/rosters.json': q.rosters, 'leagues/fbawc/S79/qualifying.json': q.qualifying,
});
const wDocs = (w: typeof stages.wStart) => ({
  'calendar.json': w.calendar, 'leagues/fbawc/S80/rosters.json': w.rosters, 'leagues/fbawc/S80/worldcup.json': w.worldCup,
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('WcGamePage', () => {
  it('watches the next qualifying game live and saves the qualifying doc once', async () => {
    mount(79, qDocs(stages.qStart), 1);
    fireEvent.click(await screen.findByRole('button', { name: 'Sim to end' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes.map(w => w.path)).toEqual(['leagues/fbawc/S79/qualifying.json']);
  });

  it('shows a played qualifying game as a box score', async () => {
    const next = nextQualifyingGame(stages.qStart);
    if (typeof next === 'string') throw new Error(next);
    const sim = simWcGame(stages.qStart.rosters, next, mulberry32(1));
    if (typeof sim === 'string') throw new Error(sim);
    const r = recordQualifyingGame(stages.qStart, sim);
    if (!r.ok) throw new Error('x');
    mount(79, qDocs(r.state), 1);
    expect(await screen.findByText('Qualifying')).toBeTruthy();
    expect(document.querySelectorAll('table.box-score').length).toBe(2);
    expect(screen.getByRole('link', { name: /Back to qualifying/ })).toBeTruthy();
  });

  it('shows a played group game and lets the next one be watched', async () => {
    const next = nextGroupGame(stages.wStart);
    if (typeof next === 'string') throw new Error(next);
    const sim = simWcGame(stages.wStart.rosters, next, mulberry32(2));
    if (typeof sim === 'string') throw new Error(sim);
    const r = recordGroupGame(stages.wStart, sim);
    if (!r.ok) throw new Error('x');
    mount(80, wDocs(r.state), 1);
    expect(await screen.findByText('Group stage')).toBeTruthy();
    cleanup();
    mount(80, wDocs(r.state), 2);
    expect(await screen.findByRole('button', { name: 'Auto' })).toBeTruthy();
  });

  it("says so for a game that isn't up next, and watches the first knockout game", async () => {
    mount(80, wDocs(stages.wStart), 5);
    expect(await screen.findByText(/hasn't been played, and it isn't up next/)).toBeTruthy();
    cleanup();
    mount(80, wDocs(stages.wKnockoutStart), 193);
    expect(await screen.findByRole('button', { name: 'Auto' })).toBeTruthy();
  });
});
