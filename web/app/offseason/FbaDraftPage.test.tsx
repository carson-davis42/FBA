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
    [proRatingsPath(80)]: f.ratings,
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
const rowOf = (name: string) => within(screen.getByRole('table', { name: 'Prospects' })).getByRole('link', { name }).closest('tr') as HTMLElement;

describe('FbaDraftPage', () => {
  it('asks for Adjust Age first when there is no draft board', async () => {
    stubApi(docs({ draft: null }));
    renderPage();
    expect(await screen.findByText('Run Adjust Age first.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Adjust Age ▸' }).getAttribute('href')).toBe('/offseason/adjust-age');
  });

  it('lists the prospects in ranking order, with buttons only for early entrants', async () => {
    stubApi(docs());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'S80 draft' })).toBeTruthy();
    await screen.findByRole('table', { name: 'Prospects' });
    expect(names('Prospects')).toEqual(['Sam Senior', 'Tim Taken', 'Dan Draftee', 'Eve Early']);
    const dan = rowOf('Dan Draftee');
    expect(within(dan).getByText('School One')).toBeTruthy();
    expect(within(dan).getByText('Jr')).toBeTruthy();
    expect(within(dan).getByRole('button', { name: 'Back to school' })).toBeTruthy();
    expect(within(dan).getByRole('button', { name: 'Portal' })).toBeTruthy();
    expect(within(rowOf('Sam Senior')).queryByRole('button', { name: 'Back to school' })).toBeNull();
    expect(within(rowOf('Sam Senior')).queryByRole('button', { name: 'Portal' })).toBeNull();
    expect(screen.queryByLabelText(/^FBA rating for /)).toBeNull();
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
      ['players.json', '0000000000000001'],
    ].sort());
    expect(log.batches).toHaveLength(1);
    expect(await within(await screen.findByRole('table', { name: 'Prospects' })).findByRole('link', { name: 'Sophie So' })).toBeTruthy();
  });

  it('lets an eligible player enter the portal straight from the declare list, in one batch', async () => {
    const log = stubApi(docs());
    renderPage();
    const list = await screen.findByRole('list', { name: 'School One early entrants' });
    const sophie = within(list).getByText(/Sophie So/).closest('li') as HTMLElement;
    const button = within(sophie).getByRole('button', { name: 'Portal' }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Sophie So enters the transfer portal');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([boardPath(79), 'leagues/fbajc/S80/rosters.json', 'leagues/fbajc/S80/transactions.json'].sort());
    expect(log.batches).toHaveLength(1);
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

  it('can start with no FBA ratings: the class is rated after the draft', async () => {
    const log = stubApi(docs());
    renderPage();
    const start = await enabled('Start the draft');
    expect(start.disabled).toBe(false);
    expect(screen.queryByText(/has no FBA rating/)).toBeNull();
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
    expect(names('Prospects')).toEqual(['Tim Taken', 'Eve Early']);
    expect(within(rowOf('Tim Taken')).getByRole('button', { name: 'Draft' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to school' })).toBeNull();
    expect(names('Picks')).toEqual(['1', '2']);
    expect(within(screen.getByRole('table', { name: 'Picks' })).getByText((_, el) => el?.tagName === 'TD' && el.textContent === 'Dan Draftee (PF, School One)')).toBeTruthy();
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

describe('FbaDraftPage prospect outlook', () => {
  const slot = (position: 'PG' | 'SG' | 'SF' | 'PF' | 'C', rating: number | null): RosterEntry => ({
    playerId: rating === null ? null : `f${position}${rating}`, position, rating, age: 25, points: 0, stars: null,
  } as RosterEntry);
  const open = (position: 'PF' | 'C', n: number) => Array.from({ length: n }, () => slot(position, null));
  /** FBA spots: PF 8 open and C 8 open (the 5 D2 spots leave PF 5 and C 6), SG and PG none (rated 90). Prospects: Sam Senior PG 80 (Sr), Tim Taken SG 72 (Jr), Dan Draftee PF 70 (Jr), Eve Early C 68 (So). */
  const fbaWithSpots = () => ({ league: 'fba', season: 80, locked: false, teams: { T00: [...open('PF', 8), ...open('C', 8), slot('SG', 90), slot('PG', 90)] } });
  const filler = (n: number) => Array.from({ length: n }, (_, k) => ({ playerId: `p9${String(k).padStart(4, '0')}`, position: 'SG' as const, college: 't1', classYear: 'Sr' as const, senior: true, collegeRating: 99, stars: null, fbaRating: null }));
  const render80 = (draft?: DraftFile) => {
    stubApi({ ...docs(draft ? { draft } : {}), 'leagues/fba/S80/rosters.json': fbaWithSpots() });
    renderPage();
  };
  const cells = (name: string) => (rowOf(name) as HTMLTableRowElement).cells;
  const barOf = (name: string) => cells(name)[4].className;

  it('shows each prospect\'s overall and position rank after the Class column', async () => {
    render80();
    await screen.findByRole('table', { name: 'Prospects' });
    const head = within(screen.getByRole('table', { name: 'Prospects' })).getAllByRole('columnheader').map(h => h.textContent);
    expect(head.slice(0, 7)).toEqual(['Name', 'Pos', 'School', 'Class', 'Rank', 'Pos rank', 'College']);
    // Scores: Sam 80, Tim 73, Dan 71, Eve 70; the table is in that order.
    expect(names('Prospects')).toEqual(['Sam Senior', 'Tim Taken', 'Dan Draftee', 'Eve Early']);
    expect([cells('Sam Senior')[4].textContent, cells('Tim Taken')[4].textContent, cells('Dan Draftee')[4].textContent, cells('Eve Early')[4].textContent]).toEqual(['1', '2', '3', '4']);
    expect(cells('Dan Draftee')[5].textContent).toBe('1');
  });

  it('colours early entrants: green inside both checks, amber inside one; a senior has none', async () => {
    render80();
    await screen.findByRole('table', { name: 'Prospects' });
    expect(barOf('Dan Draftee')).toContain('clinch-stay');
    expect(barOf('Eve Early')).toContain('clinch-stay');
    expect(barOf('Tim Taken')).toContain('clinch-close');
    expect(barOf('Sam Senior')).not.toContain('clinch-');
    expect(cells('Dan Draftee')[4].getAttribute('title')).toBe('Position rank 1 of 5 spots; overall rank 3 of 12');
  });

  it('is red inside neither check, and the legend lists the states that appear', async () => {
    const base = draftBoardState().draft;
    render80({ ...base, prospects: [...base.prospects, ...filler(12)] });
    await screen.findByRole('table', { name: 'Prospects' });
    expect(barOf('Tim Taken')).toContain('clinch-withdraw');
    expect(barOf('Dan Draftee')).toContain('clinch-close');
    const key = screen.getByRole('list', { name: 'Standings key' });
    expect(within(key).getAllByRole('listitem').map(li => li.textContent)).toEqual(['A close call', 'Unlikely to make an FBA roster']);
  });

  it('has no adjustable numbers: the calculation is the engine\'s', async () => {
    render80();
    await screen.findByRole('table', { name: 'Prospects' });
    expect(screen.queryByLabelText('Replaceable at or below')).toBeNull();
    expect(screen.queryByLabelText('Spots for D2 players')).toBeNull();
  });

  it('recalculates the ranks and colours when a prospect goes back to school', async () => {
    render80();
    await screen.findByRole('table', { name: 'Prospects' });
    fireEvent.click(await enabled('Back to school', rowOf('Tim Taken')));
    await waitFor(() => expect(names('Prospects')).not.toContain('Tim Taken'));
    expect(cells('Dan Draftee')[4].textContent).toBe('2');
  });

  it('moves a prospect with the arrows: one batch that saves the ranking, and the table follows', async () => {
    const log = stubApi({ ...docs(), 'leagues/fba/S80/rosters.json': fbaWithSpots() });
    renderPage();
    await screen.findByRole('table', { name: 'Prospects' });
    fireEvent.click(await enabled('Move Eve Early up'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Eve Early moves up the rankings');
    expect(log.batches[0].writes.map(w => w.path)).toEqual([draftPath(80)]);
    await waitFor(() => expect(names('Prospects')).toEqual(['Sam Senior', 'Tim Taken', 'Eve Early', 'Dan Draftee']));
    expect(cells('Eve Early')[4].textContent).toBe('3');
  });

  it('has no up arrow on the top row or down arrow on the bottom row', async () => {
    render80();
    await screen.findByRole('table', { name: 'Prospects' });
    expect((screen.getByRole('button', { name: 'Move Sam Senior up' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Move Eve Early down' }) as HTMLButtonElement).disabled).toBe(true);
    expect((await enabled('Move Sam Senior down') as HTMLButtonElement).disabled).toBe(false);
  });

  it('has position tabs that show one position, keeping the overall ranks', async () => {
    render80();
    await screen.findByRole('table', { name: 'Prospects' });
    expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'PF' }));
    expect(names('Prospects')).toEqual(['Dan Draftee']);
    expect(cells('Dan Draftee')[4].textContent).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(names('Prospects')).toHaveLength(4);
  });

  it('keeps the rank columns after the draft starts, without the colour bars or arrows', async () => {
    stubApi({ ...docs({ draft: startedDraft() }), 'leagues/fba/S80/rosters.json': fbaWithSpots() });
    renderPage();
    await screen.findByRole('table', { name: 'Prospects' });
    const rows = within(screen.getByRole('table', { name: 'Prospects' })).getAllByRole('row').slice(1) as HTMLTableRowElement[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.cells[4].className).not.toContain('clinch-');
    expect(within(screen.getByRole('table', { name: 'Prospects' })).getAllByRole('columnheader').map(h => h.textContent)).toContain('Pos rank');
    expect(screen.queryByRole('button', { name: /^Move .* (up|down)$/ })).toBeNull();
  });
});
