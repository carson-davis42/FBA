// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPool } from '../../engine/d2/pool';
import type { D2State } from '../../engine/d2/state';
import { d2BaseState, d2RatedState } from '../../engine/d2/testFixtures';
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
});
