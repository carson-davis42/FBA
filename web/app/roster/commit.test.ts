// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signPlayer } from '../../engine/roster/moves';
import { baseState } from '../../engine/roster/testFixtures';
import { commitMove, newBatchId } from './commit';

afterEach(() => vi.unstubAllGlobals());

describe('commitMove', () => {
  it('posts every changed document plus extras as one batch', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, batchId: '1-0' })));
    vi.stubGlobal('fetch', fetchMock);
    const saved: string[] = [];
    window.addEventListener('doc-saved', e => saved.push((e as CustomEvent<string>).detail));
    const r = signPlayer(baseState(), { playerId: 'p00030', teamId: 'CAR', years: 2, amount: 2, conflict: 'release' }, { batchId: 'b1' });
    if (!r.ok) throw new Error('sign failed');
    await commitMove(r, [{ path: 'calendar.json', doc: { season: 79, steps: [] } }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/batch');
    const body = JSON.parse(String(init.body));
    expect(body.label).toBe('Sign Azubuike Okoro → CAR');
    expect(body.writes.map((w: { path: string }) => w.path).sort()).toEqual([
      'calendar.json', 'leagues/fba/S79/freeAgents.json', 'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json',
    ]);
    expect(saved).toContain('leagues/fba/S79/rosters.json');
  });

  it('makes unique batch ids', () => {
    expect(newBatchId()).not.toBe(newBatchId());
  });
});
