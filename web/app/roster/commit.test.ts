// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signPlayer } from '../../engine/roster/moves';
import { baseState } from '../../engine/roster/testFixtures';
import { commitMove, newBatchId } from './commit';

afterEach(() => vi.unstubAllGlobals());

describe('commitMove', () => {
  it('posts every changed document plus extras as one batch, each with its loaded version', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, batchId: '1-0', versions: {} })));
    vi.stubGlobal('fetch', fetchMock);
    const saved: string[] = [];
    window.addEventListener('doc-saved', e => saved.push((e as CustomEvent<string>).detail));
    const r = signPlayer(baseState(), { playerId: 'p00030', teamId: 'CAR', years: 2, amount: 2, conflict: 'release' }, { batchId: 'b1' });
    if (!r.ok) throw new Error('sign failed');
    const versions = {
      'calendar.json': '000000000000000c',
      'leagues/fba/S79/freeAgents.json': '000000000000000f',
      'leagues/fba/S79/rosters.json': '000000000000000a',
      'leagues/fba/S79/transactions.json': null,
    };
    await commitMove(r, versions, [{ path: 'calendar.json', doc: { season: 79, steps: [] } }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/batch');
    const body = JSON.parse(String(init.body));
    expect(body.label).toBe('Sign Azubuike Okoro → CAR');
    expect(Object.fromEntries(body.writes.map((w: { path: string; baseVersion: string | null }) => [w.path, w.baseVersion]))).toEqual(versions);
    expect(saved).toContain('leagues/fba/S79/rosters.json');
  });

  it('refuses to save a document whose version was never loaded', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = signPlayer(baseState(), { playerId: 'p00030', teamId: 'CAR', years: 2, amount: 2, conflict: 'release' }, { batchId: 'b1' });
    if (!r.ok) throw new Error('sign failed');
    await expect(commitMove(r, {})).rejects.toThrow(/No loaded version for leagues\/fba\/S79\//);
  });

  it('makes unique batch ids', () => {
    expect(newBatchId()).not.toBe(newBatchId());
  });
});
