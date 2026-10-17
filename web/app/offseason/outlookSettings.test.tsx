// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OUTLOOK } from '../../engine/offseason/prospectOutlook';
import { useOutlookSettings } from './outlookSettings';

const KEY = 'fba-prospect-outlook';
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('useOutlookSettings', () => {
  it('starts at the defaults', () => {
    const { result } = renderHook(() => useOutlookSettings());
    expect(result.current[0]).toEqual(DEFAULT_OUTLOOK);
  });
  it('keeps a change for the next visit', () => {
    const first = renderHook(() => useOutlookSettings());
    act(() => first.result.current[1]({ replaceableAtOrBelow: 70 }));
    expect(first.result.current[0].replaceableAtOrBelow).toBe(70);
    first.unmount();
    const second = renderHook(() => useOutlookSettings());
    expect(second.result.current[0]).toEqual({ ...DEFAULT_OUTLOOK, replaceableAtOrBelow: 70 });
  });
  it('uses the defaults for junk, and for storage that throws', () => {
    localStorage.setItem(KEY, '{not json');
    expect(renderHook(() => useOutlookSettings()).result.current[0]).toEqual(DEFAULT_OUTLOOK);
    localStorage.setItem(KEY, JSON.stringify({ replaceableAtOrBelow: 'x', historyCutoff: 3.5, d2Reserve: null }));
    expect(renderHook(() => useOutlookSettings()).result.current[0]).toEqual(DEFAULT_OUTLOOK);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useOutlookSettings());
    expect(result.current[0]).toEqual(DEFAULT_OUTLOOK);
    act(() => result.current[1]({ d2Reserve: 8 }));
    expect(result.current[0].d2Reserve).toBe(8);
  });
  it('clamps changes: reserve to 30, replaceable cutoff to 1, history to 60; ignores a non-number', () => {
    const { result } = renderHook(() => useOutlookSettings());
    act(() => result.current[1]({ d2Reserve: 500 }));
    act(() => result.current[1]({ replaceableAtOrBelow: 0 }));
    act(() => result.current[1]({ historyCutoff: 999 }));
    expect(result.current[0]).toEqual({ replaceableAtOrBelow: 1, historyCutoff: 60, d2Reserve: 30 });
    act(() => result.current[1]({ historyCutoff: Number.NaN }));
    expect(result.current[0].historyCutoff).toBe(60);
  });
});
