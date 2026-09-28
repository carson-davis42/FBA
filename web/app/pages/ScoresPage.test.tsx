// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(await screen.findByText('Game 1 · Next')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Watch' })).toBeNull();
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
});
