// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './CalendarPage';

let saved: unknown = null;
const calendar = { season: 79, steps: [
  { id: 'age', label: 'Adjust Age', kind: 'offseason', league: null, sub: true, done: true },
  { id: 'fa', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false },
  { id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: false },
] };

beforeEach(() => {
  saved = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { saved = JSON.parse(String(init.body)); return new Response('{"ok":true}'); }
    return new Response(JSON.stringify(saved ?? calendar));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CalendarPage', () => {
  it('marks the current step done', async () => {
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /mark "Free Agency\/Offseason" done/i }));
    await waitFor(() => expect(saved).not.toBeNull());
    expect((saved as typeof calendar).steps.map(s => s.done)).toEqual([true, true, false]);
  });

  it('reopens the last finished step', async () => {
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /reopen previous step/i }));
    await waitFor(() => expect(saved).not.toBeNull());
    expect((saved as typeof calendar).steps.map(s => s.done)).toEqual([false, false, false]);
  });
});
