// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './CalendarPage';

let saved: unknown = null;
let current: unknown;
let extra: Record<string, unknown> = {};
const calendar = { season: 79, steps: [
  { id: 'age', label: 'Adjust Age', kind: 'offseason', league: null, sub: true, done: true },
  { id: 'fa', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false },
  { id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: false },
] };

beforeEach(() => {
  saved = null;
  current = calendar;
  extra = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { saved = JSON.parse(String(init.body)); return new Response('{"ok":true}'); }
    const rel = url.replace('/api/state/', '');
    if (rel === 'calendar.json') return new Response(JSON.stringify(saved ?? current));
    if (rel in extra) return new Response(JSON.stringify(extra[rel]));
    return new Response(JSON.stringify({ error: `Not found: ${rel}` }), { status: 404 });
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

  it('refuses to reopen a finished league season', async () => {
    current = { season: 79, steps: [
      { id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: true },
      { id: 's80-fba-draft-lottery', label: 'S80 FBA Draft Lottery', kind: 'offseason', league: null, sub: false, done: false },
    ] };
    extra['leagues/fba/S79/summary.json'] = { league: 'fba', season: 79, locked: true, host: null, champions: [] };
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    expect(await screen.findByText('S79 FBA season is finished')).toBeTruthy();
    expect((screen.getByRole('button', { name: /reopen previous step/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers Go to next season once every step is done', async () => {
    current = { ...calendar, steps: calendar.steps.map(s => ({ ...s, done: true })) };
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    expect((await screen.findByRole('link', { name: 'Go to next season ▸' })).getAttribute('href')).toBe('/next-season');
    expect(screen.queryByRole('button', { name: /^Mark/ })).toBeNull();
  });
});
