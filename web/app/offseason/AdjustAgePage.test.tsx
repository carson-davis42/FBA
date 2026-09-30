// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardPath } from '../../engine/college/state';
import { ADJUST_AGE_STEP, draftPath, type AdjustAgeState } from '../../engine/offseason/adjustAge';
import { ageState } from '../../engine/offseason/testFixtures';
import { docPath } from '../../engine/roster/state';
import { markStepDone } from '../../engine/shared/calendar';
import { stubApi } from '../d2/testDocs';
import { AdjustAgePage } from './AdjustAgePage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** The documents the page loads (no S80 college transactions and no draft board yet). */
function docs(over: Partial<AdjustAgeState> = {}): Record<string, unknown> {
  const s = ageState(over);
  const n = s.season;
  return {
    'meta.json': s.meta,
    'calendar.json': s.calendar,
    'players.json': s.players,
    [docPath('fba', n)]: s.fba,
    [docPath('freeAgents', n)]: s.freeAgents,
    [docPath('fbaTx', n)]: s.fbaTx,
    [docPath('d2', n)]: s.d2,
    [docPath('reserves', n)]: s.reserves,
    [`leagues/fbajc/S${n - 1}/rosters.json`]: s.prevCollege,
    'leagues/fbajc/teams.json': s.collegeTeams,
    [boardPath(n - 1)]: s.board,
  };
}

const renderPage = () => render(<MemoryRouter><AdjustAgePage /></MemoryRouter>);

describe('AdjustAgePage', () => {
  it('shows the preview and who is displaced to the portal', async () => {
    stubApi(docs());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Adjust Age' })).toBeTruthy();
    expect(await screen.findByText('4 players age a year')).toBeTruthy();
    expect(screen.getByText('1 Senior enters the S80 draft')).toBeTruthy();
    expect(screen.getByText('1 unnamed Senior leaves')).toBeTruthy();
    expect(screen.getByText('2 commitments join their schools')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Displaced to the portal' });
    const item = within(list).getByText(/Cal Center/);
    expect(item.textContent).toContain('School One');
    expect(item.textContent).toContain('Jr');
  });

  it('posts one batch with the writes from adjustAge, and a second click does not post again', async () => {
    const log = stubApi(docs());
    renderPage();
    const button = await screen.findByRole('button', { name: 'Adjust Age' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    const writes = log.batches[0].writes;
    const byPath = new Map(writes.map(w => [w.path, w]));
    expect([...byPath.keys()].sort()).toEqual([
      'calendar.json',
      boardPath(79),
      docPath('d2', 80),
      docPath('fba', 80),
      docPath('fbaTx', 80),
      docPath('freeAgents', 80),
      docPath('reserves', 80),
      draftPath(80),
      'leagues/fbajc/S80/rosters.json',
      'leagues/fbajc/S80/transactions.json',
      'meta.json',
    ].sort());
    // Loaded documents carry their version; documents that don't exist yet are written without one.
    expect(byPath.get(docPath('fba', 80))!.baseVersion).toBe('0000000000000001');
    expect(byPath.get('calendar.json')!.baseVersion).toBe('0000000000000001');
    expect(byPath.get(boardPath(79))!.baseVersion).toBe('0000000000000001');
    expect(byPath.get(draftPath(80))!.baseVersion).toBeNull();
    expect(byPath.get('leagues/fbajc/S80/rosters.json')!.baseVersion).toBeNull();
    expect(byPath.get('leagues/fbajc/S80/transactions.json')!.baseVersion).toBeNull();
    expect(log.batches[0].label).toBe('Adjust Age (S80)');
    expect(await screen.findByText('Ages are adjusted.')).toBeTruthy();
    expect(log.batches).toHaveLength(1);
  });

  it('links to the draft board and the pro ratings once the step is done', async () => {
    const s = ageState();
    stubApi(docs({ calendar: markStepDone(s.calendar, ADJUST_AGE_STEP) }));
    renderPage();
    expect(await screen.findByText('Ages are adjusted.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Draft board ▸' }).getAttribute('href')).toBe('/league/fba/draft');
    expect(screen.getByRole('link', { name: 'Pro ratings ▸' }).getAttribute('href')).toBe('/league/fba/ratings');
    expect(screen.queryByRole('button', { name: 'Adjust Age' })).toBeNull();
  });

  it('shows the problems and no button when the move is refused', async () => {
    const d = docs();
    d[draftPath(80)] = { league: 'fba', season: 80, locked: false, started: false, prospects: [], picks: [] };
    stubApi(d);
    renderPage();
    expect(await screen.findByText('The S80 draft board already exists')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Adjust Age' })).toBeNull();
  });
});
