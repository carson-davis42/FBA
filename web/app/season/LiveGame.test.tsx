// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { lineup } from '../../engine/season/moves';
import { simGame, type SimTeam } from '../../engine/season/sim';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import { LiveGame } from './LiveGame';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(save: () => Promise<void>) {
  const state = fbaSeasonState();
  const sim = simGame(1, lineup(state, 'BOS') as SimTeam, lineup(state, 'CAR') as SimTeam, mulberry32(3));
  render(<MemoryRouter><LiveGame state={state} sim={sim} save={save} back={{ to: '/x', label: 'back ▸' }} /></MemoryRouter>);
}

describe('LiveGame', () => {
  it('saves exactly once at the final buzzer and links back', async () => {
    const save = vi.fn(async () => {});
    setup(save);
    fireEvent.click(screen.getByRole('button', { name: 'Next possession' }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sim to end' }));
    expect(await screen.findByRole('link', { name: 'Saved · back ▸' })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('shows a failed save and retries on request', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('This data changed in another tab'))
      .mockResolvedValueOnce(undefined);
    setup(save);
    fireEvent.click(screen.getByRole('button', { name: 'Sim to end' }));
    expect(await screen.findByText('This data changed in another tab')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('link', { name: 'Saved · back ▸' })).toBeTruthy();
  });
});
