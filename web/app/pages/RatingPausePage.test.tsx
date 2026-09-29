// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullFbaState, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import { startRatingPause } from '../../engine/season/ratingPause';
import type { SeasonState } from '../../engine/season/state';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import type { GameResult } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { RatingPausePage } from './RatingPausePage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function atFirstPause(): SeasonState {
  const s = fbaSeasonState();
  const pairs = [['BOS', 'CAR'], ['DEN', 'MEM'], ['BOS', 'DEN'], ['CAR', 'MEM']];
  const games: GameResult[] = pairs.map(([home, away], k) => ({
    gameNo: k + 1, home, away, homePts: 50, awayPts: 60,
    box: {
      home: s.rosters.teams[home].map(e => ({ playerId: e.playerId!, pts: 10 })),
      away: s.rosters.teams[away].map(e => ({ playerId: e.playerId!, pts: 12 })),
    },
  }));
  return { ...s, results: { ...s.results!, games } };
}

const renderPage = () => render(<MemoryRouter><RatingPausePage /></MemoryRouter>);

describe('RatingPausePage', () => {
  it('says when no adjustment is due', async () => {
    stubApi(seasonDocs(fbaSeasonState()));
    renderPage();
    expect(await screen.findByText(/No rating adjustment is due right now/)).toBeTruthy();
  });

  it('starts the adjustments as one batch', async () => {
    const log = stubApi(seasonDocs(atFirstPause()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start rating adjustments' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start rating adjustments (after game 4)');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fba/S79/ratingPause-4.json', null]]);
  });

  it('autosaves edits and finishes with the autosaved version', async () => {
    const started = startRatingPause(atFirstPause());
    if (!started.ok) throw new Error(started.problems.join('; '));
    const log = stubApi(seasonDocs(started.state));
    renderPage();
    const input = await screen.findByLabelText('New rating for BOS SG');
    fireEvent.change(input, { target: { value: '91' } });
    fireEvent.blur(input);
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0].path).toBe('leagues/fba/S79/ratingPause-4.json');
    const cont = screen.getByRole('button', { name: 'Continue' });
    await waitFor(() => expect((cont as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(cont);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Finish rating adjustments (after game 4)');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
      'leagues/fba/S79/ratingPause-4.json', 'leagues/fba/S79/rosters.json', 'leagues/fba/S79/schedule.json', 'leagues/fba/S79/transactions.json',
    ]);
    expect(log.batches[0].writes.find(w => w.path.endsWith('ratingPause-4.json'))!.baseVersion).toBe('0000000000000002');
  });

  it('continues to the playoffs once the last rating pause is done', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullFbaState())));
    renderPage();
    expect((await screen.findByRole('link', { name: 'Continue to playoffs ▸' })).getAttribute('href')).toBe('/league/fba/playoffs');
    expect(screen.queryByRole('link', { name: 'Back to scores ▸' })).toBeNull();
  });
});
