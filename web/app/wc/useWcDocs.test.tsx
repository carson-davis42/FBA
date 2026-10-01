// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWcDocs } from './useWcDocs';

const docs: Record<string, unknown> = {
  'calendar.json': { season: 79, steps: [] },
  'leagues/fbawc/S78/qualifying.json': { marker: 'q78' },
};
const requested: string[] = [];

beforeEach(() => {
  requested.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const rel = url.replace('/api/state/', '');
    requested.push(rel);
    const doc = docs[rel];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('useWcDocs', () => {
  it('gives null for missing docs and null versions for their paths', async () => {
    const { result } = renderHook(() => useWcDocs(79));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).toBeUndefined();
    expect(result.current.calendar).toEqual({ season: 79, steps: [] });
    expect(result.current.worldCup).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.rosters).toBeNull();
    expect(result.current.versions['calendar.json']).toBe('v1');
    expect(result.current.versions['leagues/fbawc/S79/worldcup.json']).toBeNull();
    expect(result.current.versions['leagues/fbawc/S79/rosters.json']).toBeNull();
  });
  it('reads qualifying from the previous season for an even season, this season for an odd one', async () => {
    const even = renderHook(() => useWcDocs(80));
    await waitFor(() => expect(even.result.current.ready).toBe(true));
    expect(requested).toContain('leagues/fbawc/S79/qualifying.json');
    expect(requested).toContain('leagues/fbawc/S79/rosters.json');
    expect(Object.keys(even.result.current.versions)).toContain('leagues/fbawc/S79/qualifying.json');
    const odd = renderHook(() => useWcDocs(79));
    await waitFor(() => expect(odd.result.current.ready).toBe(true));
    expect(requested).toContain('leagues/fbawc/S79/qualifying.json');
  });
});
