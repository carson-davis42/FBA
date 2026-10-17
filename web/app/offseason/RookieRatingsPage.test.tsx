// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DraftFile, RostersFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { RookieRatingsPage } from './RookieRatingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const NAMES = ['Ann', 'Bea', 'Cal', 'Dee', 'Eli', 'Fay'];
const ids = NAMES.map((_, i) => `p0000${i + 1}`);
const POS = ['PG', 'SG', 'SF', 'PF', 'C', 'PG'] as const;
const rookie = (i: number) => ({ playerId: ids[i], position: POS[i], rating: null, age: 19, points: 0, contractEnd: 81, contractAmount: 2, restricted: true });

const draft = (over: Partial<DraftFile> = {}): DraftFile => ({
  league: 'fba', season: 80, locked: true, started: true,
  prospects: ids.map((playerId, i) => ({ playerId, position: POS[i], college: 'c1', classYear: 'Sr' as const, senior: true, collegeRating: 99 - i, stars: null, fbaRating: null })),
  picks: [
    { slot: 1, owner: 'T1', originalTeam: 'T1', playerId: ids[0] }, { slot: 2, owner: 'T2', originalTeam: 'T2', playerId: ids[1] },
    { slot: 3, owner: 'T1', originalTeam: 'T1', playerId: ids[2] },
  ],
  ...over,
});
const step = (id: string, label: string, done: boolean) => ({ id, label, kind: 'offseason' as const, league: null, sub: false, done });
function docs(over: { draft?: DraftFile; ratingStepDone?: boolean; draftDone?: boolean } = {}): Record<string, unknown> {
  return {
    'meta.json': { currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 79, fbawc: 79 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 } },
    'players.json': { nextId: 20, players: Object.fromEntries(ids.map((id, i) => [id, { id, name: NAMES[i], birthSeason: 61 }])) },
    'calendar.json': { season: 80, steps: [
      step('s80-fba-draft', 'S80 FBA Draft', over.draftDone ?? true),
      step('s80-rate-rookies', 'Rate S80 Rookies', over.ratingStepDone ?? false),
      step('free-agency-offseason', 'Free Agency/Offseason', false),
    ] },
    'leagues/fba/teams.json': { league: 'fba', teams: [
      { teamId: 'T1', name: 'Team One', abbr: 'ONE', group: 'E', logoFolder: null, badge: { bg: '#111', fg: '#fff' } },
      { teamId: 'T2', name: 'Team Two', abbr: 'TWO', group: 'W', logoFolder: null, badge: { bg: '#111', fg: '#fff' } },
    ] },
    'leagues/fbajc/teams.json': { league: 'fbajc', teams: [{ teamId: 'c1', name: 'School One', abbr: 'SCH', group: 'X', logoFolder: null, badge: { bg: '#111', fg: '#fff' } }] },
    'leagues/fba/S80/draft.json': over.draft ?? draft(),
    'leagues/fba/S80/rosters.json': { league: 'fba', season: 80, locked: false, teams: { T1: [rookie(0), rookie(2)], T2: [rookie(1)] } } as RostersFile,
    'leagues/fba/S80/freeAgents.json': { league: 'fba', season: 80, locked: false, players: [] },
    'leagues/fbad2/S80/reserves.json': { league: 'fbad2', season: 80, locked: false, players: [] },
    'leagues/fba/S80/transactions.json': { league: 'fba', season: 80, entries: [] },
  };
}
const renderPage = () => render(<MemoryRouter><RookieRatingsPage /></MemoryRouter>);
const rows = () => within(screen.getByRole('table', { name: 'Rookie ratings' })).getAllByRole('row').slice(1) as HTMLTableRowElement[];
const box = (name: string) => screen.getByLabelText(`Rookie rating for ${name}`) as HTMLInputElement;

describe('RookieRatingsPage', () => {
  it('lists the class in ranking order with who drafted each player, and a rating box for each', async () => {
    stubApi(docs());
    renderPage();
    await screen.findByRole('table', { name: 'Rookie ratings' });
    expect(rows().map(r => r.cells[1].textContent)).toEqual(NAMES);
    expect(rows().map(r => r.cells[0].textContent)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(rows()[0].cells[4].textContent).toBe('#1 · Team One');
    expect(rows()[1].cells[4].textContent).toBe('#2 · Team Two');
    expect(rows()[3].cells[4].textContent).toBe('Undrafted');
    expect(box('Ann').getAttribute('min')).toBe('55');
    expect(box('Ann').getAttribute('max')).toBe('99');
  });

  it('follows the manual order of the prospect rankings', async () => {
    stubApi(docs({ draft: draft({ rankOrder: [ids[2], ids[0]] }) }));
    renderPage();
    await screen.findByRole('table', { name: 'Rookie ratings' });
    expect(rows().map(r => r.cells[1].textContent).slice(0, 3)).toEqual(['Cal', 'Bea', 'Ann']);
  });

  it('saves a typed rating on blur as one batch with the loaded version, and refuses a bad one', async () => {
    const log = stubApi(docs());
    renderPage();
    await screen.findByRole('table', { name: 'Rookie ratings' });
    fireEvent.change(box('Ann'), { target: { value: '54' } });
    fireEvent.blur(box('Ann'));
    expect(await screen.findByText('Enter a whole number from 55 to 99')).toBeTruthy();
    expect(log.batches).toHaveLength(0);
    fireEvent.change(box('Ann'), { target: { value: '80' } });
    fireEvent.blur(box('Ann'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Ann: rookie rating 80');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fba/S80/draft.json', '0000000000000001']]);
    expect((log.batches[0].writes[0].doc as DraftFile).rookieRatings).toEqual({ [ids[0]]: 80 });
  });

  it('shows the saved ratings and lists what blocks the finish, with the button disabled', async () => {
    stubApi(docs({ draft: draft({ rookieRatings: { [ids[0]]: 80, [ids[2]]: 70 } }) }));
    renderPage();
    await screen.findByRole('table', { name: 'Rookie ratings' });
    expect(box('Ann').value).toBe('80');
    expect(box('Cal').value).toBe('70');
    expect(screen.getByText('Cal is rated, but Bea, ranked above, is not')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Finish the rookie ratings' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('finishes as one batch writing the rosters, free agents, Reserves, transactions and calendar', async () => {
    const log = stubApi(docs({ draft: draft({ rookieRatings: { [ids[0]]: 80, [ids[1]]: 75, [ids[2]]: 70, [ids[3]]: 60 } }) }));
    renderPage();
    await screen.findByRole('table', { name: 'Rookie ratings' });
    const finish = screen.getByRole('button', { name: 'Finish the rookie ratings' }) as HTMLButtonElement;
    await waitFor(() => expect(finish.disabled).toBe(false));
    fireEvent.click(finish);
    fireEvent.click(finish);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Finish the S80 rookie ratings');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
      'calendar.json', 'leagues/fba/S80/freeAgents.json', 'leagues/fba/S80/rosters.json', 'leagues/fba/S80/transactions.json', 'leagues/fbad2/S80/reserves.json',
    ]);
    expect(log.batches).toHaveLength(1);
  });

  it('says so, with no boxes, when this is not the current step', async () => {
    stubApi(docs({ draftDone: false }));
    renderPage();
    expect(await screen.findByText(/Rookies are rated at the Rate S80 Rookies step/)).toBeTruthy();
    expect(screen.queryByLabelText('Rookie rating for Ann')).toBeNull();
  });

  it('says the step is done once it is finished, and offers no boxes', async () => {
    stubApi(docs({ ratingStepDone: true }));
    renderPage();
    expect(await screen.findByText(/rookies are rated/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finish the rookie ratings' })).toBeNull();
  });
});
