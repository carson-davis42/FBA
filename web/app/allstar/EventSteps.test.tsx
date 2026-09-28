// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { AllStarPage } from './AllStarPage';
import { allStarSeasonState, type Stage } from './testState';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const open = (stage: Stage) => {
  const log = stubApi(seasonDocs(allStarSeasonState(stage)));
  render(<MemoryRouter><AllStarPage /></MemoryRouter>);
  return log;
};

describe('All-Star events', () => {
  it('reveals the 5pt contest roll by roll and saves at the end', async () => {
    const log = open('drawn');
    fireEvent.click(await screen.findByRole('button', { name: 'Run the 5pt contest' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll next' }));
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Roll to end' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Run the 5pt contest');
    expect(await screen.findByRole('button', { name: 'Run the dunk contest' })).toBeTruthy();
  });

  it('drafts Young-Stars', async () => {
    const log = open('ysgDrafting');
    const board = await screen.findByRole('table', { name: 'Available Young-Stars' });
    fireEvent.click(within(board).getAllByRole('row')[1]);
    fireEvent.click(screen.getByRole('button', { name: /^Pick / }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Young-Star draft pick 1');
  });

  it('plays the All-Star Game and finishes the weekend', async () => {
    const log = open('ysgPlayed');
    fireEvent.click(await screen.findByRole('button', { name: 'Play the All-Star Game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll to end' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Play the All-Star Game');
    cleanup();
    const log2 = open('complete');
    fireEvent.click(await screen.findByRole('button', { name: 'Finish All-Star weekend' }));
    await waitFor(() => expect(log2.batches).toHaveLength(1));
    expect(log2.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/allstar.json', 'leagues/fba/S79/schedule.json']);
  });
});
