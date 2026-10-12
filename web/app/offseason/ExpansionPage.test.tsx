// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expansionOrder, expansionPath, type ExpansionState } from '../../engine/offseason/expansion';
import { expansionState } from '../../engine/offseason/testFixtures';
import { calendarFor } from '../../engine/shared/calendar';
import type { ExpansionFile, TeamsFile, TransactionsFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { ExpansionPage } from './ExpansionPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(<MemoryRouter><ExpansionPage /></MemoryRouter>);
const V1 = '0000000000000001';

const draftDocs = (expansion: ExpansionFile | null, over: Partial<ExpansionState> = {}): Record<string, unknown> => {
  const s = expansionState(over);
  const out: Record<string, unknown> = {
    'meta.json': { currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 80, fbawc: 80 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 } },
    'calendar.json': s.calendar,
    'leagues/fba/teams.json': s.teams,
    'leagues/fba/S80/rosters.json': s.fba,
    'leagues/fba/S80/transactions.json': s.tx,
    'players.json': s.players,
    'leagues/fba/draftHistory.json': s.history,
  };
  if (expansion) out[expansionPath(80)] = expansion;
  return out;
};
const file = (over: Partial<ExpansionFile> = {}): ExpansionFile => ({
  league: 'fba', season: 80, phase: 'protect', protections: {}, order: expansionOrder(['PHI', 'LAL']), picks: [], ...over,
});
const enabled = async (name: string) => {
  const b = await screen.findByRole('button', { name }) as HTMLButtonElement;
  await waitFor(() => expect(b.disabled).toBe(false));
  return b;
};
const box = (name: string) => screen.findByRole('checkbox', { name }) as Promise<HTMLInputElement>;

describe('ExpansionPage', () => {
  it('add mode: lists the teams and adds them in one batch', async () => {
    const cal = calendarFor(79);
    const at = cal.steps.findIndex(s => s.id === 's80-add-expansion-teams');
    const teams: TeamsFile = { league: 'fba', teams: expansionState().teams.teams.filter(t => t.fromSeason === undefined) };
    const log = stubApi({
      'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
      'calendar.json': { ...cal, steps: cal.steps.map((s, i) => ({ ...s, done: i < at })) },
      'leagues/fba/teams.json': teams,
      'leagues/fba/S79/transactions.json': { league: 'fba', season: 79, entries: [] } as TransactionsFile,
    });
    renderPage();
    expect(await screen.findByText('Philly Phantoms')).toBeTruthy();
    expect(screen.getByText('Team 32')).toBeTruthy();
    const button = await enabled('Add teams');
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion]).sort()).toEqual([
      ['calendar.json', V1], ['leagues/fba/S79/transactions.json', V1], ['leagues/fba/teams.json', V1],
    ]);
    expect(log.batches).toHaveLength(1);
  });

  it('after Add teams in S79: confirms the added teams instead of "No expansion"', async () => {
    const cal = calendarFor(79);
    const at = cal.steps.findIndex(s => s.id === 's80-add-expansion-teams');
    stubApi({
      'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
      'calendar.json': { ...cal, steps: cal.steps.map((s, i) => ({ ...s, done: i <= at })) },
      'leagues/fba/teams.json': expansionState().teams,
    });
    renderPage();
    expect(await screen.findByText(/The S80 expansion teams have been added; the expansion draft comes after the S80 FBA draft\./)).toBeTruthy();
    expect(screen.getByText('Philly Phantoms')).toBeTruthy();
    expect(screen.queryByText('No expansion this season')).toBeNull();
  });

  it('says so when the season has no expansion', async () => {
    const cal = calendarFor(81);
    stubApi({
      'meta.json': { currentSeason: 81, rosterSeason: { fba: 81, fbad2: 81, fbajc: 81, fbawc: 81 }, lastSeason: { fba: 80, fbad2: 80, fbajc: 80, fbawc: 80 } },
      'calendar.json': cal,
    });
    renderPage();
    expect(await screen.findByText('No expansion this season')).toBeTruthy();
  });

  it('draft mode before the start: starts the expansion draft with expansion.json at version null', async () => {
    const log = stubApi(draftDocs(null));
    renderPage();
    fireEvent.click(await enabled('Start expansion draft'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion]).sort()).toEqual([
      [expansionPath(80), null], ['leagues/fba/S80/transactions.json', V1],
    ]);
  });

  it('protect mode: caps protections at four, marks restricted players, saves a protection', async () => {
    const log = stubApi(draftDocs(file()));
    renderPage();
    // Team A (first): its C is restricted and has no checkbox.
    expect(await screen.findByText('Protected (restricted)')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Protect A C' })).toBeNull();
    expect(screen.getByText(/36 players exposed from 8 teams; the draft needs 8 picks/)).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Team A (0/4)' })).toBeTruthy();

    fireEvent.click(await box('Protect A PG'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([[expansionPath(80), V1]]);
    expect((log.batches[0].writes[0].doc as ExpansionFile).protections).toEqual({ A: ['p10001'] });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Team A (1/4)' })).toBeTruthy());
  });

  it('protect mode: the fifth box is disabled and Lock protections shows the refusal', async () => {
    const protections = { A: ['p10001', 'p10002', 'p10003', 'p10004'], B: ['p10006', 'p10007', 'p10008', 'p10009'] };
    stubApi(draftDocs(file({ protections })));
    renderPage();
    expect((await box('Protect A PG')).checked).toBe(true);
    // A has only one exposed player left (none: its C is restricted), so only 7 teams can lose a player.
    expect(screen.getByText(/Only 7 teams have an exposed player; the draft needs 8/)).toBeTruthy();
    const lock = screen.getByRole('button', { name: 'Lock protections' }) as HTMLButtonElement;
    expect(lock.disabled).toBe(true);

    fireEvent.change(screen.getByRole('combobox', { name: 'Team' }), { target: { value: 'B' } });
    const fifth = await box('Protect B C');
    expect(fifth.disabled).toBe(true);
    expect((await box('Protect B PG')).disabled).toBe(false);
  });

  it('protect mode: locks the protections when enough players are exposed', async () => {
    const log = stubApi(draftDocs(file()));
    renderPage();
    fireEvent.click(await enabled('Lock protections'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect((log.batches[0].writes[0].doc as ExpansionFile).phase).toBe('draft');
  });

  it('draft mode: PHI is on the clock; Take saves expansion, rosters and transactions', async () => {
    const log = stubApi(draftDocs(file({ phase: 'draft' })));
    renderPage();
    expect(await screen.findByText(/On the clock: pick 1/)).toBeTruthy();
    expect(within(screen.getByText(/On the clock/).closest('div') as HTMLElement).getByText('Philly Phantoms')).toBeTruthy();
    fireEvent.click(await enabled('Take A PG'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion]).sort()).toEqual([
      [expansionPath(80), V1], ['leagues/fba/S80/rosters.json', V1], ['leagues/fba/S80/transactions.json', V1],
    ]);
    expect((log.batches[0].writes.find(w => w.path === expansionPath(80))!.doc as ExpansionFile).picks).toHaveLength(1);
  });

  it('draft mode: a pick for a position the team holds is refused with its text and posts nothing', async () => {
    const s = expansionState();
    const phi = s.fba.teams.PHI.map(e => (e.position === 'PG'
      ? { ...e, playerId: 'p10099', rating: 60, age: 25, contractEnd: 82, contractAmount: 1 }
      : e));
    const fba = { ...s.fba, teams: { ...s.fba.teams, PHI: phi } };
    const players = { ...s.players, players: { ...s.players.players, p10099: { id: 'p10099', name: 'Phil PG', birthSeason: 55 } } };
    const log = stubApi(draftDocs(file({ phase: 'draft' }), { fba, players }));
    renderPage();
    const take = await screen.findByRole('button', { name: 'Take A PG' }) as HTMLButtonElement;
    expect(take.disabled).toBe(true);
    expect(screen.getAllByText(/Philly Phantoms already has a PG/).length).toBeGreaterThan(0);
    fireEvent.click(take);
    expect(log.batches).toHaveLength(0);
    expect((await screen.findByRole('button', { name: 'Take A SG' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('draft mode: after the last pick, Finish expansion draft saves the history and the calendar', async () => {
    const order = file().order;
    const picks = order.map((teamId, i) => ({ n: i + 1, teamId, fromTeamId: 'A', playerId: `p1000${i + 1}`, position: 'PG' as const }));
    const log = stubApi(draftDocs(file({ phase: 'draft', picks })));
    renderPage();
    expect(await screen.findByText(/All 8 picks are made/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Take / })).toBeNull();
    fireEvent.click(await enabled('Finish expansion draft'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
      'calendar.json', expansionPath(80), 'leagues/fba/S80/transactions.json', 'leagues/fba/draftHistory.json',
    ]);
  });

  it('done mode: shows the picks and no buttons', async () => {
    const order = file().order;
    const picks = order.map((teamId, i) => ({ n: i + 1, teamId, fromTeamId: 'B', playerId: `p1000${i + 1}`, position: 'PG' as const }));
    stubApi(draftDocs(file({ phase: 'done', picks })));
    renderPage();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(9);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
