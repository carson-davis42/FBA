// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FranchisesFile, Team } from '../../engine/shared/types';
import { TeamFull } from './useTeams';

afterEach(cleanup);

const team = (teamId: string, name: string, abbr: string): Team => ({ teamId, name, abbr, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams = [team('MON', 'Montreal Chevaliers', 'MON')];
const franchises: FranchisesFile = { franchises: [{ teamId: 'MON', eras: [
  { name: 'Montreal Chevaliers', abbr: 'MON', city: 'Montreal', from: 57, to: null },
  { name: 'Montreal', abbr: 'MON', city: 'Montreal', from: 12, to: 56 },
] }] };

describe('TeamFull', () => {
  it('shows an old name with its franchise mark when franchises are loaded', () => {
    const { container } = render(<TeamFull teams={teams} franchises={franchises} name="Montreal" season={30} />);
    expect(container.querySelector('.team-name')).toBeTruthy();
    expect(screen.getByText('Montreal')).toBeTruthy();
  });
  it('shows plain text for an old name without franchises', () => {
    const { container } = render(<TeamFull teams={teams} name="Montreal" season={30} />);
    expect(container.querySelector('.team-name')).toBeNull();
    expect(container.textContent).toBe('Montreal');
  });
});
