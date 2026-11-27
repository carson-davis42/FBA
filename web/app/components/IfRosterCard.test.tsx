// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { interestedTeams } from '../../engine/roster/interest';
import { baseState } from '../../engine/roster/testFixtures';
import { IfRosterCard } from './IfRosterCard';

afterEach(cleanup);

const input = { playerId: 'p00030', teamId: 'CAR', years: 1, amount: 2, conflict: 'release' as const };

describe('IfRosterCard fit breakdown', () => {
  it('shows the parts of the fit score for the team', () => {
    const state = baseState();
    const fit = interestedTeams(state, 'p00030').find(r => r.teamId === 'CAR')!;
    render(<IfRosterCard state={state} input={input} teamName="CAR Team" fit={fit} />);
    const box = screen.getByLabelText('Fit score');
    expect(within(box).getByText('Fit score 60')).toBeTruthy();
    expect(within(box).getByText('Team strength 40 / 40')).toBeTruthy();
    expect(within(box).getByText('Filled spots 20 / 20')).toBeTruthy();
    expect(within(box).getByText('College region 0 / 15')).toBeTruthy();
    expect(within(box).getByText('Played here 0 / 15')).toBeTruthy();
    expect(within(box).queryByText(/own team/)).toBeNull();
  });
  it('says so when the team is not on his interested list, and shows nothing when no fit is given', () => {
    const state = baseState();
    const { rerender } = render(<IfRosterCard state={state} input={{ ...input, teamId: 'MON' }} teamName="MON Team" fit={null} />);
    expect(screen.getByText(/isn't on his interested list/)).toBeTruthy();
    rerender(<IfRosterCard state={state} input={input} teamName="CAR Team" />);
    expect(screen.queryByLabelText('Fit score')).toBeNull();
  });
});
