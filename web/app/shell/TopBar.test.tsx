// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
});
