// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseState } from '../../engine/roster/testFixtures';
import { RestrictedFreeAgents } from './RestrictedFreeAgents';

afterEach(cleanup);

const teams = ['BOS', 'CAR', 'MON'].map(t => ({ teamId: t, name: `${t} Team`, abbr: t, group: 'E' as const, logoFolder: null, badge: { bg: '#123', fg: '#fff' } }));
const show = (teamId = '') => {
  const onResign = vi.fn();
  const onLetGo = vi.fn();
  render(<RestrictedFreeAgents state={baseState()} teams={teams} teamId={teamId} busy={false} onResign={onResign} onLetGo={onLetGo} />);
  return { onResign, onLetGo };
};

describe('RestrictedFreeAgents', () => {
  it('lists only rookies whose restricted contract has ended', () => {
    show();
    // MON's PF p00012 (restricted, ended S78) is one; MON's PG p00010 (restricted, runs to S80) and every veteran are not.
    const rows = within(screen.getByRole('table', { name: 'Restricted free agents list' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('MON');
    expect(rows[0].textContent).toContain('thru S78');
  });
  it('re-signs or lets go with the buttons, passing the team and the player', () => {
    const { onResign, onLetGo } = show();
    fireEvent.click(screen.getByRole('button', { name: /^Re-sign / }));
    expect(onResign).toHaveBeenCalledWith('MON', 'p00012');
    fireEvent.click(screen.getByRole('button', { name: /^Let .* go$/ }));
    expect(onLetGo).toHaveBeenCalledWith('MON', 'p00012');
  });
  it('says so when the team filter leaves none', () => {
    show('BOS');
    expect(screen.getByText('No restricted free agents for this team.')).toBeTruthy();
  });
});
