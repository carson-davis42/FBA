// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { teamsFile32 } from '../../engine/offseason/testFixtures';
import type { PickObligation } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { conditionText, DraftPicksPage } from './DraftPicksPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const META = { currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 79, fbawc: 78 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 78 } };
const ob = (o: Partial<PickObligation> & Pick<PickObligation, 'id' | 'season' | 'originalTeam' | 'owner'>): PickObligation => ({
  condition: { kind: 'none' }, originalCondition: { kind: 'none' }, originSeason: o.season, priority: 1, rolls: [], note: '', ...o,
});

const render_ = (obligations: PickObligation[]) => {
  stubApi({ 'meta.json': META, 'leagues/fba/teams.json': teamsFile32(), 'leagues/fba/picks.json': { league: 'fba', obligations } });
  render(<MemoryRouter><DraftPicksPage /></MemoryRouter>);
};

describe('conditionText', () => {
  it('spells out each protection', () => {
    expect(conditionText({ kind: 'top', n: 4 })).toBe('Top 4 protected');
    expect(conditionText({ kind: 'lottery' })).toBe('Lottery protected');
    expect(conditionText({ kind: 'none' })).toBe('Unprotected');
  });
});

describe('DraftPicksPage', () => {
  const picks = [
    ob({ id: 'a', season: 81, originalTeam: 'T01', owner: 'T02', condition: { kind: 'top', n: 4 }, originalCondition: { kind: 'top', n: 4 } }),
    ob({ id: 'b', season: 82, originalTeam: 'T03', owner: 'T03' }),
    ob({ id: 'c', season: 81, originalTeam: 'T04', owner: 'T05', condition: { kind: 'top', n: 2 }, originalCondition: { kind: 'top', n: 3 }, originSeason: 80, rolls: [{ fromSeason: 80, reason: 'protected' }] }),
  ];
  it('groups the picks by season with their protection and what rolled', async () => {
    render_(picks);
    const s81 = await screen.findByRole('table', { name: 'S81 picks' });
    expect(within(s81).getAllByRole('row')).toHaveLength(3);
    expect(within(s81).getByText('Top 4 protected')).toBeTruthy();
    expect(within(s81).getByText(/S80: protection held/)).toBeTruthy();
    expect(screen.getByRole('table', { name: 'S82 picks' })).toBeTruthy();
  });
  it('filters to traded and to rolled picks', async () => {
    render_(picks);
    await screen.findByRole('table', { name: 'S81 picks' });
    fireEvent.click(screen.getByRole('button', { name: 'Traded' }));
    expect(screen.queryByRole('table', { name: 'S82 picks' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rolled' }));
    expect(within(screen.getByRole('table', { name: 'S81 picks' })).getAllByRole('row')).toHaveLength(2);
  });
});
