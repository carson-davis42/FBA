// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { baseState } from '../../engine/roster/testFixtures';
import { PositionFill } from './PositionFill';

afterEach(cleanup);

describe('PositionFill', () => {
  it('shows for each position the spots left and the teams with a player signed', () => {
    const state = baseState();
    for (const id of Object.keys(state.fba.teams)) {
      state.fba.teams[id] = state.fba.teams[id].map(e => (e.position !== 'PG' ? e : { ...e, playerId: id === 'BOS' ? e.playerId ?? 'p00001' : null, contractEnd: id === 'BOS' ? 80 : null }));
    }
    render(<PositionFill teams={state.fba.teams} season={79} />);
    const tiles = within(screen.getByRole('region', { name: 'Spots left by position' })).getAllByRole('listitem');
    expect(tiles).toHaveLength(5);
    expect(tiles[0].textContent).toBe('PG2left · 1 of 3 signed');
  });
});
