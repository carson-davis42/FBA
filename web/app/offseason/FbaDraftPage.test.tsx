// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardPath } from '../../engine/college/state';
import { draftPath } from '../../engine/offseason/adjustAge';
import { draftStepId } from '../../engine/offseason/fbaDraft';
import { lotteryPath } from '../../engine/offseason/lottery';
import { proRatingsPath } from '../../engine/offseason/proRatings';
import { draftBoardState, draftFbaTeams, draftLottery, draftRosters, fbaDraftState } from '../../engine/offseason/testFixtures';
import type { DraftFile, DraftPick, RosterEntry } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { FbaDraftPage } from './FbaDraftPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(<MemoryRouter><FbaDraftPage /></MemoryRouter>);

const rated = (draft: DraftFile): DraftFile => ({ ...draft, prospects: draft.prospects.map((p, i) => ({ ...p, fbaRating: 80 - i })) });
/** Picks 1 and 2 made (Dan Draftee, Sam Senior): the draft is on the clock at #3, which T05 owns from T27. */
const startedDraft = (rate = true): DraftFile => {
  const base = rate ? rated(draftBoardState().draft) : draftBoardState().draft;
  const picks: DraftPick[] = [...draftLottery().picks].sort((a, b) => a.slot - b.slot).map(p => ({
    slot: p.slot, owner: p.owner, originalTeam: p.originalTeam, playerId: p.slot === 1 ? 'p00034' : p.slot === 2 ? 'p00001' : null,
  }));
  return { ...base, started: true, picks };
};

/** The documents the page loads. The S80 college transactions don't exist yet, and S80 is at the draft step. */
function docs(over: { draft?: DraftFile | null; withCalendar?: boolean; withoutBoard?: boolean } = {}): Record<string, unknown> {
  const b = draftBoardState();
  const f = fbaDraftState();
  const out: Record<string, unknown> = {
    'meta.json': { currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 79, fbawc: 79 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 } },
    'players.json': b.players,
    'calendar.json': over.withCalendar === false ? { ...f.calendar, steps: f.calendar.steps.map(s => ({ ...s, done: s.id === 'adjust-age' })) } : f.calendar,
    'leagues/fbajc/teams.json': b.collegeTeams,
    'leagues/fba/teams.json': draftFbaTeams(),
    'leagues/fbajc/S80/rosters.json': b.rosters,
    [boardPath(79)]: b.board,
    [proRatingsPath(80)]: b.ratings,
    [lotteryPath(79)]: draftLottery(),
    'leagues/fba/S80/rosters.json': draftRosters(),
    'leagues/fba/S80/freeAgents.json': f.freeAgents,
    'leagues/fba/S80/transactions.json': f.tx,
  };
  if (over.withoutBoard) delete out[boardPath(79)];
  if (over.draft !== null) out[draftPath(80)] = over.draft ?? b.draft;
  return out;
}
const enabled = async (name: string, root: HTMLElement = document.body) => {
  const b = await within(root).findByRole('button', { name }) as HTMLButtonElement;
  await waitFor(() => expect(b.disabled).toBe(false));
  return b;
};
const names = (table: string) => within(screen.getByRole('table', { name: table })).getAllByRole('row').slice(1).map(r => (r as HTMLTableRowElement).cells[0].textContent);
const rowOf = (name: string) => screen.getByText(name, { selector: 'td' }).closest('tr') as HTMLElement;

describe('FbaDraftPage', () => {
  it('asks for Adjust Age first when there is no draft board', async () => {
    stubApi(docs({ draft: null }));
    renderPage();
    expect(await screen.findByText('Run Adjust Age first.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Adjust Age ▸' }).getAttribute('href')).toBe('/offseason/adjust-age');
  });

  it('lists the prospects in board order, with buttons only for early entrants', async () => {
    stubApi(docs());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'S80 draft' })).toBeTruthy();
    await screen.findByRole('table', { name: 'Prospects' });
    expect(names('Prospects')).toEqual(['Dan Draftee', 'Sam Senior', 'Tim Taken', 'Eve Early']);
    const dan = rowOf('Dan Draftee');
    expect(within(dan).getByText('School One')).toBeTruthy();
    expect(within(dan).getByText('Jr')).toBeTruthy();
    expect(within(dan).getByRole('button', { name: 'Back to school' })).toBeTruthy();
    expect(within(dan).getByRole('button', { name: 'Portal' })).toBeTruthy();
    expect(within(rowOf('Sam Senior')).queryByRole('button')).toBeNull();
    // Only the two who were not rated in the pro reset take a typed rating.
    expect(screen.getAllByLabelText(/^FBA rating for /).map(i => i.getAttribute('aria-label'))).toEqual(['FBA rating for Tim Taken', 'FBA rating for Eve Early']);
  });

  it('saves a typed rating on blur and on Enter, and refuses a bad one', async () => {
    const log = stubApi(docs());
    renderPage();
    const tim = await screen.findByLabelText('FBA rating for Tim Taken');
    fireEvent.change(tim, { target: { value: '100' } });
    fireEvent.blur(tim);
    expect(await screen.findByText('Enter a whole number from 1 to 99')).toBeTruthy();
    expect(log.batches).toHaveLength(0);

    fireEvent.change(tim, { target: { value: '70' } });
    fireEvent.blur(tim);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Tim Taken: FBA rating 70');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([[draftPath(80), '0000000000000001']]);
    expect((log.batches[0].writes[0].doc as DraftFile).prospects.find(p => p.playerId === 'p00036')!.fbaRating).toBe(70);
    await waitFor(() => expect((screen.getByLabelText('FBA rating for Tim Taken') as HTMLInputElement).value).toBe('70'));

    const eve = screen.getByLabelText('FBA rating for Eve Early');
    fireEvent.change(eve, { target: { value: '55' } });
    fireEvent.keyDown(eve, { key: 'Enter' });
    await waitFor(() => expect(log.batches).toHaveLength(2));
    expect(log.batches[1].label).toBe('Eve Early: FBA rating 55');
    expect(log.batches[1].writes[0].baseVersion).toBe('0000000000000002');
  });

  it('declares an early entrant, grouped by school, in one batch', async () => {
    const log = stubApi(docs());
    renderPage();
    const list = await screen.findByRole('list', { name: 'School One early entrants' });
    expect(within(list).getByText(/Cal Center/)).toBeTruthy();
    expect(within(list).getByText(/Sophie So/)).toBeTruthy();
    expect(screen.queryByText(/Pat Portal/)).toBeNull();
    const sophie = within(list).getByText(/Sophie So/).closest('li') as HTMLElement;
    const button = within(sophie).getByRole('button', { name: 'Declare' }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Sophie So declares for the draft');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion]).sort()).toEqual([
      [draftPath(80), '0000000000000001'],
      ['leagues/fbajc/S80/rosters.json', '0000000000000001'],
      ['leagues/fbajc/S80/transactions.json', null],
    ].sort());
    expect(log.batches).toHaveLength(1);
    expect(await screen.findByText('Sophie So', { selector: 'td' })).toBeTruthy();
  });

  it('sends an early entrant back to school or into the portal', async () => {
    const log = stubApi(docs());
    renderPage();
    await screen.findByRole('table', { name: 'Prospects' });
    fireEvent.click(await enabled('Back to school', rowOf('Dan Draftee')));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Dan Draftee returns to School One');
    await waitFor(() => expect(names('Prospects')).not.toContain('Dan Draftee'));
    fireEvent.click(await enabled('Portal', rowOf('Tim Taken')));
    await waitFor(() => expect(log.batches).toHaveLength(2));
    expect(log.batches[1].label).toBe('Tim Taken enters the transfer portal');
    expect(log.batches[1].writes.map(w => [w.path, w.baseVersion]).sort()).toEqual([
      [boardPath(79), '0000000000000001'],
      [draftPath(80), '0000000000000002'],
      // The first move created the college transactions, so the second carries the version that save returned.
      ['leagues/fbajc/S80/transactions.json', '0000000000000001'],
    ].sort());
  });

  it('still loads when the S80 board is missing, and creates it on the first move that writes it', async () => {
    const log = stubApi(docs({ withoutBoard: true }));
    renderPage();
    await screen.findByRole('table', { name: 'Prospects' });
    fireEvent.click(await enabled('Portal', rowOf('Tim Taken')));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    const w = log.batches[0].writes.find(x => x.path === boardPath(79))!;
    expect(w.baseVersion).toBeNull();
  });

  it('lists what blocks the start, and disables it', async () => {
    const log = stubApi(docs());
    renderPage();
    const start = await screen.findByRole('button', { name: 'Start the draft' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.getByText('Eve Early has no FBA rating')).toBeTruthy();
    expect(screen.getByText('Tim Taken has no FBA rating')).toBeTruthy();
    expect(log.batches).toHaveLength(0);
  });

  it('has no start button away from the draft step', async () => {
    stubApi(docs({ withCalendar: false }));
    renderPage();
    await screen.findByRole('table', { name: 'Prospects' });
    expect(screen.queryByRole('button', { name: 'Start the draft' })).toBeNull();
    expect(screen.getByText(/The draft starts at the/)).toBeTruthy();
  });

  it('starts the draft in one batch', async () => {
    const log = stubApi(docs({ draft: rated(draftBoardState().draft) }));
    renderPage();
    const start = await enabled('Start the draft');
    fireEvent.click(start);
    fireEvent.click(start);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start the S80 draft');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion]).sort()).toEqual([
      [draftPath(80), '0000000000000001'],
      ['leagues/fba/S80/transactions.json', '0000000000000001'],
    ].sort());
    expect(await screen.findByText(/On the clock: #1 City 29/)).toBeTruthy();
    expect(log.batches).toHaveLength(1);
  });

  it('shows the pick on the clock with its original team, the prospects left and the picks made', async () => {
    stubApi(docs({ draft: startedDraft() }));
    renderPage();
    await screen.findByRole('table', { name: 'Prospects' });
    expect((await screen.findByText(/On the clock:/)).textContent).toBe('On the clock: #3 City 05 (from T27)');
    expect(names('Prospects')).toEqual(['Eve Early', 'Tim Taken']);
    expect(within(rowOf('Tim Taken')).getByRole('button', { name: 'Draft' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to school' })).toBeNull();
    expect(names('Picks')).toEqual(['1', '2']);
    expect(within(screen.getByRole('table', { name: 'Picks' })).getByText('Dan Draftee (PF, School One)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finish the draft' })).toBeNull();
  });

  it('drafts a prospect in one batch onto the team on the clock', async () => {
    const log = stubApi(docs({ draft: startedDraft() }));
    renderPage();
    await screen.findByRole('table', { name: 'Prospects' });
    const button = await enabled('Draft', rowOf('Tim Taken'));
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('#3: City 05 selects Tim Taken');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion]).sort()).toEqual([
      [draftPath(80), '0000000000000001'],
      ['leagues/fba/S80/rosters.json', '0000000000000001'],
      ['leagues/fba/S80/transactions.json', '0000000000000001'],
    ].sort());
    const roster = log.batches[0].writes.find(w => w.path === 'leagues/fba/S80/rosters.json')!.doc as { teams: Record<string, RosterEntry[]> };
    expect(roster.teams.T05.at(-1)).toMatchObject({ playerId: 'p00036', restricted: true, contractAmount: 2, contractEnd: 81 });
    await waitFor(() => expect(names('Prospects')).toEqual(['Eve Early']));
    expect((await screen.findByText(/On the clock:/)).textContent).toBe('On the clock: #4 City 26');
  });

  it('finishes once every prospect is drafted, in one batch', async () => {
    const d = startedDraft();
    const all = { ...d, picks: d.picks.map(p => ({ ...p, playerId: p.slot === 3 ? 'p00036' : p.slot === 4 ? 'p00035' : p.playerId })) };
    const log = stubApi(docs({ draft: all }));
    renderPage();
    expect(await screen.findByText('No prospects are left.')).toBeTruthy();
    const finish = await enabled('Finish the draft');
    fireEvent.click(finish);
    fireEvent.click(finish);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Finish the S80 draft');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion]).sort()).toEqual([
      ['calendar.json', '0000000000000001'],
      [draftPath(80), '0000000000000001'],
      ['leagues/fba/S80/freeAgents.json', '0000000000000001'],
      ['leagues/fba/S80/transactions.json', '0000000000000001'],
    ].sort());
    expect(await screen.findByText('The S80 draft is finished.')).toBeTruthy();
  });

  it('shows the full pick list once the draft is finished', async () => {
    stubApi(docs({ draft: { ...startedDraft(), locked: true } }));
    renderPage();
    expect(await screen.findByText('The S80 draft is finished.')).toBeTruthy();
    expect(names('Picks')).toHaveLength(30);
    expect(within(screen.getByRole('table', { name: 'Picks' })).getAllByText('No selection')).toHaveLength(28);
    expect(screen.queryByRole('button', { name: 'Draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finish the draft' })).toBeNull();
  });
});
