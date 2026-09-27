// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFLICT_MESSAGE } from './api';
import { useAutosaveDoc } from './useAutosaveDoc';

afterEach(() => vi.unstubAllGlobals());

const D0 = { v: 0 };
const D9 = { v: 9 };

describe('useAutosaveDoc', () => {
  it('chains saves so each uses the version the previous one returned', async () => {
    let n = 1;
    const fetchMock = vi.fn(async () => { n++; return new Response(JSON.stringify({ ok: true, version: String(n).padStart(16, '0') })); });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAutosaveDoc<{ v: number }>('calendar.json', D0, '0000000000000001'));
    act(() => {
      result.current.update(d => ({ v: d.v + 1 }));
      result.current.update(d => ({ v: d.v + 1 }));
    });
    expect(result.current.doc).toEqual({ v: 2 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(c => new Headers(c[1].headers).get('If-Match'))).toEqual(['"0000000000000001"', '"0000000000000002"']);
    expect(JSON.parse(String(calls[1][1].body))).toEqual({ v: 2 });
    await waitFor(() => expect(result.current.version).toBe('0000000000000003'));
  });

  it('shows the error and falls back to the server copy after a failed save', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'stale', conflicts: ['calendar.json'] }), { status: 409 })));
    const { result } = renderHook(() => useAutosaveDoc<{ v: number }>('calendar.json', D0, '0000000000000001'));
    act(() => result.current.update(() => ({ v: 5 })));
    await waitFor(() => expect(result.current.error).toBe(CONFLICT_MESSAGE));
    expect(result.current.doc).toEqual({ v: 0 });
  });

  it('takes new server data when no save is pending', () => {
    const { result, rerender } = renderHook(
      ({ d, v }: { d: { v: number }; v: string | null }) => useAutosaveDoc('calendar.json', d, v),
      { initialProps: { d: D0, v: '0000000000000001' as string | null } },
    );
    rerender({ d: D9, v: '0000000000000009' });
    expect(result.current.doc).toEqual({ v: 9 });
    expect(result.current.version).toBe('0000000000000009');
  });
});
