// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fbaPlayers } from '../../engine/allstar/common';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { AllStarPage } from './AllStarPage';
import { allStarSeasonState } from './testState';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const renderPage = () => render(<MemoryRouter><AllStarPage /></MemoryRouter>);

describe('AllStarPage', () => {
  it('waits for the All-Star pause', async () => {
    stubApi(seasonDocs(fbaSeasonState()));
    renderPage();
    expect(await screen.findByText(/happens at the ¾ pause/)).toBeTruthy();
  });

  it('saves selections once four Young-Star captains are named', async () => {
    const s = allStarSeasonState('none');
    const log = stubApi(seasonDocs(s));
    renderPage();
    const save = await screen.findByRole('button', { name: 'Save selections' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    const outsiders = fbaPlayers(s.rosters, s.players).filter(p => !p.restricted).slice(0, 4);
    outsiders.forEach((p, i) => fireEvent.change(screen.getByLabelText(`Young-Star captain ${i + 1}`), { target: { value: `${p.name} (${p.playerId})` } }));
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Save All-Star selections');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fba/S79/allstar.json', null]]);
  });

  it('flips for the first pick, then drafts', async () => {
    const log = stubApi(seasonDocs(allStarSeasonState('selected')));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Coin flip' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start All-Star draft (coin flip)');
    cleanup();
    const log2 = stubApi(seasonDocs(allStarSeasonState('drafting')));
    renderPage();
    const board = await screen.findByRole('table', { name: 'Available All-Stars' });
    fireEvent.click(within(board).getAllByRole('row')[1]);
    fireEvent.click(screen.getByRole('button', { name: /^Pick / }));
    await waitFor(() => expect(log2.batches).toHaveLength(1));
    expect(log2.batches[0].label).toBe('All-Star draft pick 1');
  });

  it('runs the contest draw turn by turn', async () => {
    const log = stubApi(seasonDocs(allStarSeasonState('drawing')));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Pass' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toMatch(/^Contest draw: T\d+ passes$/);
  });
});
