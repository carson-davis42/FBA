// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseState } from '../../engine/roster/testFixtures';
import { ExpiringContracts } from './ExpiringContracts';

afterEach(cleanup);

const teams = ['BOS', 'CAR', 'MON'].map(t => ({ teamId: t, name: `${t} Team`, abbr: t, group: 'E' as const, logoFolder: null, badge: { bg: '#123', fg: '#fff' } }));
// baseState is S79: contracts ending in S79 are CAR p00007 (SG), MON p00011 (SF) and BOS ... only the ones with contractEnd 79.
const show = (passed: string[] = [], teamId = '') => {
  const onExtend = vi.fn();
  const onPass = vi.fn();
  render(<ExpiringContracts state={baseState()} teams={teams} teamId={teamId} passed={new Set(passed)} busy={false} onExtend={onExtend} onPass={onPass} />);
  return { onExtend, onPass };
};
const rowsOf = () => within(screen.getByRole('table', { name: 'Expiring next year' })).getAllByRole('row').slice(1);

describe('ExpiringContracts', () => {
  it('lists the contracts that end this season, best rated first', () => {
    show();
    const names = rowsOf().map(r => r.textContent);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every(t => t!.includes('thru S79'))).toBe(true);
  });
  it('extends or passes on a player with the buttons, and a passed player can be reconsidered', () => {
    const { onExtend, onPass } = show();
    const first = rowsOf()[0];
    fireEvent.click(within(first).getByRole('button', { name: /^Extend / }));
    expect(onExtend).toHaveBeenCalledTimes(1);
    fireEvent.click(within(first).getByRole('button', { name: /^Don't extend / }));
    expect(onPass).toHaveBeenCalledWith(expect.any(String), true);
    cleanup();
    const again = show(['p00007', 'p00011']);
    const passedRows = rowsOf().filter(r => r.textContent!.includes('Not extending'));
    expect(passedRows.length).toBeGreaterThan(0);
    fireEvent.click(within(passedRows[0]).getByRole('button', { name: /^Reconsider / }));
    expect(again.onPass).toHaveBeenCalledWith(expect.any(String), false);
  });
  it('lists the passed players last', () => {
    show(['p00007']);
    const rows = rowsOf();
    expect(rows[rows.length - 1].textContent).toContain('Not extending');
  });
  it('filters to one team', () => {
    show([], 'CAR');
    expect(rowsOf().every(r => r.textContent!.includes('CAR'))).toBe(true);
  });
});
