// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullD2State, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import type { SeasonState } from '../../engine/season/state';
import { d2SeasonState, fbaSeasonState } from '../../engine/season/testFixtures';
import type { ResultsFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { ScoresPage } from './ScoresPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/scores" element={<ScoresPage />} /></Routes>
  </MemoryRouter>,
);

function atDeadline(): SeasonState {
  const s = fbaSeasonState();
  const games = s.schedule!.games.slice(0, 8).map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away, homePts: 60, awayPts: 50 }));
  return {
    ...s,
    results: { ...s.results!, games },
    schedule: { ...s.schedule!, pauses: s.schedule!.pauses.map((p, i) => (i < 2 ? { ...p, done: true } : p)) },
  };
}

/** D2 season finished and the calendar has already moved on to FBA. */
function d2OverAndAdvanced(): SeasonState {
  const s = d2SeasonState();
  const games = s.schedule!.games.map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away, homePts: 60, awayPts: 50 }));
  return {
    ...s,
    results: { ...s.results!, games },
    calendar: { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 'fba-d2' ? { ...x, done: true } : x)) },
  };
}

/** Games 1-12 played; the ratings pause after 12 is resolved but the All-Star pause at the same point still blocks. */
function q3AllstarBlocked(): SeasonState {
  const s = fbaSeasonState();
  const games = s.schedule!.games.slice(0, 12).map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away, homePts: 60, awayPts: 50 }));
  return {
    ...s,
    results: { ...s.results!, games },
    schedule: {
      ...s.schedule!,
      pauses: s.schedule!.pauses.map(p => (p.afterGame < 12 || (p.afterGame === 12 && p.kind === 'ratings') ? { ...p, done: true } : p)),
    },
  };
}

describe('ScoresPage', () => {
  it('asks for schedules first', async () => {
    stubApi(seasonDocs({ ...fbaSeasonState(), schedule: null, results: null }));
    renderAt('/league/fba/scores');
    expect(await screen.findByText(/No schedule yet/)).toBeTruthy();
  });

  it('shows the next game and quick-sims it as one batch', async () => {
    const log = stubApi(seasonDocs(fbaSeasonState()));
    renderAt('/league/fba/scores');
    expect(await screen.findByText('Game 1 · Next')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quick-sim next game' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toMatch(/^Game 1: /);
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/results.json', 'leagues/fba/S79/rosters.json']);
  });

  it('sims to the next pause day by day, then shows the pause card', async () => {
    const docs = seasonDocs(fbaSeasonState());
    const log = stubApi(docs);
    renderAt('/league/fba/scores');
    fireEvent.click(await screen.findByRole('button', { name: 'Sim' }));
    expect(await screen.findByText('Pause after game 4: rating adjustment')).toBeTruthy();
    expect((docs['leagues/fba/S79/results.json'] as ResultsFile).games).toHaveLength(4);
    expect(log.batches.length).toBeGreaterThanOrEqual(1);
    expect((screen.getByRole('button', { name: 'Quick-sim next game' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('blocks sims and explains why before the D2 cycle finishes', async () => {
    const s = fbaSeasonState();
    const early: SeasonState = { ...s, calendar: { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 'fba-d2' ? { ...x, done: false } : x)) } };
    stubApi(seasonDocs(early));
    renderAt('/league/fba/scores');
    expect(await screen.findByText('The season is played at the FBA step (current step: FBA D2)')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Quick-sim next game' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Sim' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers no Watch link before the D2 cycle finishes (F1)', async () => {
    const s = fbaSeasonState();
    const early: SeasonState = { ...s, calendar: { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 'fba-d2' ? { ...x, done: false } : x)) } };
    stubApi(seasonDocs(early));
    renderAt('/league/fba/scores');
    expect(await screen.findByText('Game 1 · Upcoming')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Watch' })).toBeNull();
  });

  it('labels the next game "Upcoming" (not "Next") while the league step is blocked (item 3)', async () => {
    const s = fbaSeasonState();
    const early: SeasonState = { ...s, calendar: { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 'fba-d2' ? { ...x, done: false } : x)) } };
    stubApi(seasonDocs(early));
    renderAt('/league/fba/scores');
    expect(await screen.findByText('Game 1 · Upcoming')).toBeTruthy();
    expect(document.querySelector('.game-card.next')).toBeNull();
  });

  it('labels the next game "Upcoming" (not "Next") while a pause blocks it (item 3)', async () => {
    stubApi(seasonDocs(atDeadline()));
    renderAt('/league/fba/scores');
    expect(await screen.findByText('Game 9 · Upcoming')).toBeTruthy();
    expect(screen.queryByText('Game 9 · Next')).toBeNull();
    expect(document.querySelector('.game-card.next')).toBeNull();
  });

  it('shows only the season-complete message once the season is over, even if a calendar step problem also applies (B2)', async () => {
    stubApi(seasonDocs(d2OverAndAdvanced()));
    renderAt('/league/fbad2/scores');
    expect(await screen.findByText('The regular season is complete.')).toBeTruthy();
    expect(screen.queryByText(/The season is played at the FBA D2 step/)).toBeNull();
  });

  it('sim-to-pause reads the next reachable pause once the only earlier unfinished pause is already blocking (B3)', async () => {
    stubApi(seasonDocs(q3AllstarBlocked()));
    renderAt('/league/fba/scores');
    expect(await screen.findByText('Pause after game 12: All-Star weekend')).toBeTruthy();
    const select = screen.getByRole('combobox', { name: 'Sim to' }) as HTMLSelectElement;
    expect(select.options[0].textContent).toBe('the next pause (after game 16)');
  });

  it('sim-to-pause reads the next reachable pause while a same-point pause already blocks (B3)', async () => {
    stubApi(seasonDocs(atDeadline()));
    renderAt('/league/fba/scores');
    expect(await screen.findByText('Pause after game 8: trade deadline')).toBeTruthy();
    const select = screen.getByRole('combobox', { name: 'Sim to' }) as HTMLSelectElement;
    expect(select.options[0].textContent).toBe('the next pause (after game 12)');
  });

  it('offers a Retry button that reloads the season after a failed load (item 4)', async () => {
    const docs = seasonDocs(fbaSeasonState());
    let fail = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = url.replace('/api/state/', '');
      if (fail && path === 'meta.json') return new Response('{}', { status: 500 });
      if (!(path in docs)) return new Response(JSON.stringify({ error: `Not found: ${path}` }), { status: 404 });
      return new Response(JSON.stringify(docs[path]), { headers: { ETag: '"0000000000000001"' } });
    }));
    renderAt('/league/fba/scores');
    expect(await screen.findByText(/Couldn't load the season/)).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Game 1 · Next')).toBeTruthy();
  });

  it('stops simming once the page is left (F8)', async () => {
    const docs = seasonDocs(d2SeasonState());
    const batchBodies: unknown[] = [];
    const pending: ((r: Response) => void)[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/batch') {
        batchBodies.push(JSON.parse(String(init!.body)));
        return new Promise<Response>(resolve => pending.push(resolve));
      }
      const path = url.replace('/api/state/', '');
      if (!(path in docs)) return Promise.resolve(new Response(JSON.stringify({ error: `Not found: ${path}` }), { status: 404 }));
      return Promise.resolve(new Response(JSON.stringify(docs[path]), { headers: { ETag: '"0000000000000001"' } }));
    }));
    const { unmount } = renderAt('/league/fbad2/scores');
    fireEvent.click(await screen.findByRole('button', { name: 'Sim' }));
    await waitFor(() => expect(batchBodies).toHaveLength(1));
    unmount();
    pending[0](new Response(JSON.stringify({ ok: true, batchId: '1-0', versions: {} })));
    await new Promise(r => setTimeout(r, 20));
    expect(batchBodies).toHaveLength(1);
  });

  it('closes trading at the deadline pause', async () => {
    const log = stubApi(seasonDocs(atDeadline()));
    renderAt('/league/fba/scores');
    fireEvent.click(await screen.findByRole('button', { name: 'Close trading' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Close trading (trade deadline)');
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/schedule.json']);
  });

  it('links to the playoffs once the regular season is over', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullD2State())));
    renderAt('/league/fbad2/scores');
    expect(await screen.findByText('The regular season is complete.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Playoffs ▸' }).getAttribute('href')).toBe('/league/fbad2/playoffs');
    expect(screen.queryByRole('combobox', { name: 'Sim to' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quick-sim next game' })).toBeNull();
  });
});
