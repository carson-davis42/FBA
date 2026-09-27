// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';

let undoAvailable = false;

beforeEach(() => {
  undoAvailable = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/undo') {
      if (init?.method === 'POST') {
        undoAvailable = false;
        return new Response(JSON.stringify({ ok: true, label: 'Sign Azubuike Okoro → CAR', paths: ['calendar.json'] }));
      }
      return new Response(JSON.stringify({ ok: true, available: undoAvailable, label: undoAvailable ? 'Sign Azubuike Okoro → CAR' : null }));
    }
    return new Response(JSON.stringify({ season: 79, steps: [] }));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('TopBar undo', () => {
  it('is hidden on mount when nothing is undoable', async () => {
    render(<TopBar />);
    await screen.findByText(/S79/);
    expect(screen.queryByRole('button', { name: /undo last move/i })).toBeNull();
  });

  it('appears on mount when the server reports an available undo', async () => {
    undoAvailable = true;
    render(<TopBar />);
    expect(await screen.findByRole('button', { name: /undo last move/i })).toBeTruthy();
  });

  it('appears after a doc-saved event and undoes it', async () => {
    render(<TopBar />);
    expect(screen.queryByRole('button', { name: /undo last move/i })).toBeNull();
    undoAvailable = true;
    act(() => { window.dispatchEvent(new CustomEvent('doc-saved', { detail: 'calendar.json' })); });
    const button = await screen.findByRole('button', { name: /undo last move/i });
    fireEvent.click(button);
    expect(await screen.findByText('Undid: Sign Azubuike Okoro → CAR')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /undo last move/i })).toBeNull();
  });

  it('disables Undo while a save is in flight', async () => {
    undoAvailable = true;
    render(<TopBar />);
    const button = await screen.findByRole('button', { name: /undo last move/i });
    let release!: () => void;
    const pending = new Promise<void>(r => { release = r; });
    const { postBatch } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementationOnce(async () => { await pending; return new Response(JSON.stringify({ ok: true, batchId: '1', versions: {} })); });
    let p!: Promise<unknown>;
    act(() => { p = postBatch('X', [{ path: 'calendar.json', doc: {}, baseVersion: null }]); });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    await act(async () => { release(); await p; });
    await waitFor(() => expect((screen.getByRole('button', { name: /undo last move/i }) as HTMLButtonElement).disabled).toBe(false));
  });
});
