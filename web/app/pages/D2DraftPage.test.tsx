// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makePick } from '../../engine/d2/draft';
import { startPool } from '../../engine/d2/pool';
import { d2Writes, type D2State } from '../../engine/d2/state';
import { d2BaseState, d2LockedState, d2RatedState } from '../../engine/d2/testFixtures';
import type { D2PoolFile } from '../../engine/shared/types';
import { docsFor, stubApi } from '../d2/testDocs';
import { D2DraftPage } from './D2DraftPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(<MemoryRouter><D2DraftPage /></MemoryRouter>);

const pooled = (): D2State => {
  const r = startPool(d2RatedState());
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
};

describe('D2DraftPage: pool', () => {
  it('asks for the ratings reset first', async () => {
    stubApi(docsFor(d2BaseState()));
    renderPage();
    expect(await screen.findByText(/Finish D2 ratings first/)).toBeTruthy();
  });

  it('starts the pool as one batch', async () => {
    const log = stubApi(docsFor(d2RatedState()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start pool' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start D2 pool');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fbad2/S79/pool.json', null]]);
  });

  it('lists the position in pool order', async () => {
    stubApi(docsFor(pooled()));
    renderPage();
    expect(await screen.findByLabelText('1. Kris Dyer')).toBeTruthy();
    expect(screen.getByLabelText('2. Ben Montgomery')).toBeTruthy();
    expect(screen.getByLabelText('3. Milo Dean')).toBeTruthy();
  });

  it('says New for players new to the league and Reserves for those already in the Reserve pool', async () => {
    stubApi(docsFor(pooled()));
    renderPage();
    const row = async (label: string) => (await screen.findByLabelText(label)).textContent;
    expect(await row('1. Kris Dyer')).toContain('Reserves');
    fireEvent.click(screen.getByRole('tab', { name: 'SG' }));
    const kyron = (await screen.findAllByText('Kyron Smart'))[0].closest('li')!;
    expect(kyron.textContent).toContain('New');
    expect(kyron.textContent).not.toContain('Reserves');
  });

  it('moves a player with the arrow buttons and autosaves the order', async () => {
    const log = stubApi(docsFor(pooled()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Move Milo Dean up' }));
    expect(screen.getByLabelText('2. Milo Dean')).toBeTruthy();
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0].path).toBe('leagues/fbad2/S79/pool.json');
    expect(log.puts[0].ifMatch).toBe('"0000000000000001"');
    expect((log.puts[0].doc as D2PoolFile).order.PG).toEqual(['p00040', 'p00025', 'p00020']);
  });

  it('moves a focused row with Alt+ArrowDown', async () => {
    const log = stubApi(docsFor(pooled()));
    renderPage();
    fireEvent.keyDown(await screen.findByLabelText('1. Kris Dyer'), { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect((log.puts[0].doc as D2PoolFile).order.PG).toEqual(['p00020', 'p00040', 'p00025']);
  });

  it('draws the cutoff line after rank 64 and tags bumped roster players', async () => {
    const s = pooled();
    const extra = Array.from({ length: 64 }, (_, i) => `p${String(100 + i).padStart(5, '0')}`);
    s.reserves.players.push(...extra.map(id => ({ playerId: id, position: 'PG' as const, age: 25, rating: 90 })));
    for (const id of extra) s.players.players[id] = { id, name: `Guard ${id}`, birthSeason: null };
    s.pool!.order.PG = [...extra, ...s.pool!.order.PG];
    stubApi(docsFor(s));
    renderPage();
    expect(await screen.findByText(/cutoff: top 64/)).toBeTruthy();
    expect(within(screen.getByLabelText('66. Ben Montgomery')).getByText('Bumped')).toBeTruthy();
    expect(within(screen.getByLabelText('65. Kris Dyer')).queryByText('Bumped')).toBeNull();
  });

  it('locks the pool as one batch that creates the draft', async () => {
    const log = stubApi(docsFor(pooled()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Lock pool' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Lock D2 pool');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
      'leagues/fbad2/S79/draft.json', 'leagues/fbad2/S79/pool.json', 'leagues/fbad2/S79/reserves.json',
      'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/S79/transactions.json',
    ]);
    expect(log.batches[0].writes.find(w => w.path.endsWith('draft.json'))!.baseVersion).toBeNull();
  });

  it('hands off to the version an autosave returned, not the originally loaded one, when Lock pool follows a move', async () => {
    const log = stubApi(docsFor(pooled()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Move Milo Dean up' }));
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0].ifMatch).toBe('"0000000000000001"');

    fireEvent.click(await screen.findByRole('button', { name: 'Lock pool' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    const write = log.batches[0].writes.find(w => w.path === 'leagues/fbad2/S79/pool.json')!;
    expect(write.baseVersion).toBe('0000000000000002');
  });
});

const pickAll = (ids: string[]): D2State => {
  let s = d2LockedState();
  for (const id of ids) {
    const r = makePick(s, id, { batchId: 'b' });
    if (!r.ok) throw new Error(r.problems.join('; '));
    s = r.state;
  }
  return s;
};

describe('D2DraftPage: draft board', () => {
  it('shows the team on the clock and drafts a clicked player', async () => {
    const log = stubApi(docsFor(d2LockedState()));
    renderPage();
    expect(await screen.findByText('On the clock: #1 BER Club')).toBeTruthy();
    expect(screen.getByText('Needs: PG, SG, PF')).toBeTruthy();
    fireEvent.click(screen.getByText('Kyron Smart'));
    fireEvent.click(screen.getByRole('button', { name: 'Draft Kyron Smart → BER Club' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('D2 draft #1: BER selects Kyron Smart');
  });

  it("shows the on-the-clock team's logo next to the heading", async () => {
    stubApi(docsFor(d2LockedState()));
    renderPage();
    await screen.findByText('On the clock: #1 BER Club');
    const badge = document.querySelector('.team-badge');
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toBe('BER');
  });

  it('re-rolls the order before the first pick', async () => {
    const log = stubApi(docsFor(d2LockedState()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Re-roll order/ }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Re-roll D2 draft order');
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fbad2/S79/draft.json']);
  });

  it('offers Undo last pick when the newest move is a pick, and hides Re-roll after a pick', async () => {
    const log = stubApi(docsFor(pickAll(['p00041'])), { undoLabel: 'D2 draft #1: BER selects Kyron Smart' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Undo last pick/ }));
    await waitFor(() => expect(log.undos).toBe(1));
    expect(screen.queryByRole('button', { name: /Re-roll order/ })).toBeNull();
  });

  it('hides Undo last pick when the newest pick is blocked (a non-journaled write changed a file since)', async () => {
    stubApi(docsFor(pickAll(['p00041'])), {
      undoLabel: 'D2 draft #1: BER selects Kyron Smart', undoBlockedBy: 'leagues/fbad2/S79/draft.json',
    });
    renderPage();
    await screen.findByText('On the clock: #2 BER Club');
    // Let the peekUndo() check that runs on mount resolve before asserting the button's absence,
    // so this can't pass merely because that check hasn't settled yet.
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(screen.queryByRole('button', { name: /Undo last pick/ })).toBeNull();
  });

  it('offers only Skip when nobody fits', async () => {
    const s = pickAll(['p00041', 'p00040', 'p00042']);
    const noC = { ...s, reserves: { ...s.reserves, players: s.reserves.players.filter(p => p.playerId !== 'p00044') } };
    const log = stubApi(docsFor(noC));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip pick' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('D2 draft #4: AMS skips');
    expect(log.batches[0].writes.map(w => w.path)).toContain('calendar.json');
  });

  it('shows the finished draft', async () => {
    stubApi(docsFor(pickAll(['p00041', 'p00040', 'p00042', 'p00044'])));
    renderPage();
    expect(await screen.findByText(/The D2 draft is finished/)).toBeTruthy();
    expect(screen.getByText(/SG-Kyron Smart/)).toBeTruthy();
  });

  it('clears the selected player when the clock changes underneath it', async () => {
    const docs = docsFor(d2LockedState());
    stubApi(docs);
    renderPage();
    expect(await screen.findByText('On the clock: #1 BER Club')).toBeTruthy();
    fireEvent.click(screen.getByText('Kyron Smart'));
    expect(await screen.findByRole('button', { name: 'Draft Kyron Smart → BER Club' })).toBeTruthy();

    // Simulate another tab (or an undo) advancing the draft with a different pick while this
    // tab still has Kyron Smart selected locally.
    const picked = makePick(d2LockedState(), 'p00040', { batchId: 'b' });
    if (!picked.ok) throw new Error(picked.problems.join('; '));
    for (const w of d2Writes(picked)) {
      docs[w.path] = w.doc;
      fireEvent(window, new CustomEvent('doc-saved', { detail: w.path }));
    }

    expect(await screen.findByText('On the clock: #2 BER Club')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Draft /})).toBeNull();
  });
});
