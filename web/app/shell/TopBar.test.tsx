// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/undo') return new Response(JSON.stringify({ ok: true, label: 'Sign Azubuike Okoro → CAR', paths: ['calendar.json'] }));
    return new Response(JSON.stringify({ season: 79, steps: [] }));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('TopBar undo', () => {
  it('appears after a move and undoes it', async () => {
    render(<TopBar />);
    expect(screen.queryByRole('button', { name: /undo last move/i })).toBeNull();
    act(() => { window.dispatchEvent(new CustomEvent('batch-saved', { detail: 'Sign' })); });
    fireEvent.click(screen.getByRole('button', { name: /undo last move/i }));
    expect(await screen.findByText('Undid: Sign Azubuike Okoro → CAR')).toBeTruthy();
  });
});
