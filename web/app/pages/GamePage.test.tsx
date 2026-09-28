// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { recordGames, simNextGames } from '../../engine/season/moves';
import type { SeasonState } from '../../engine/season/state';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { GamePage } from './GamePage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/game/:gameNo" element={<GamePage />} /></Routes>
  </MemoryRouter>,
);

describe('GamePage', () => {
  it('plays the next game live and saves it at the final buzzer', async () => {
    const log = stubApi(seasonDocs(fbaSeasonState()));
    renderAt('/league/fba/game/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Next possession' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim to end' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toMatch(/^Game 1: /);
    expect(await screen.findByText(/Final/)).toBeTruthy();
  });

  it('shows a box score for a played game', async () => {
    const s = fbaSeasonState();
    const r = recordGames(s, simNextGames(s, 1, mulberry32(4)).games);
    if (!r.ok) throw new Error(r.problems.join('; '));
    stubApi(seasonDocs(r.state));
    renderAt('/league/fba/game/1');
    expect(await screen.findByText(/^Final/)).toBeTruthy();
    const g = r.state.results!.games[0];
    expect(screen.getAllByText(`${g.home} PG`).length).toBeGreaterThan(0);
  });

  it('explains a game that is not up next', async () => {
    stubApi(seasonDocs(fbaSeasonState()));
    renderAt('/league/fba/game/3');
    expect(await screen.findByText("This game isn't up next.")).toBeTruthy();
  });

  it('refuses to start a game out of calendar order (F1)', async () => {
    const s = fbaSeasonState();
    const early: SeasonState = { ...s, calendar: { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 'fba-d2' ? { ...x, done: false } : x)) } };
    stubApi(seasonDocs(early));
    renderAt('/league/fba/game/1');
    expect(await screen.findByText('The season is played at the FBA step (current step: FBA D2)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next possession' })).toBeNull();
  });
});
