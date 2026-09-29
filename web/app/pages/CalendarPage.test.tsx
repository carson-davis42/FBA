// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './CalendarPage';

let saved: unknown = null;
let current: unknown;
let extra: Record<string, unknown> = {};
let errors: Record<string, number> = {};
let pending: Record<string, Promise<void>> = {};
const calendar = { season: 79, steps: [
  { id: 'age', label: 'Adjust Age', kind: 'offseason', league: null, sub: true, done: true },
  { id: 'fa', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false },
  { id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: false },
] };

beforeEach(() => {
  saved = null;
  current = calendar;
  extra = {};
  errors = {};
  pending = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { saved = JSON.parse(String(init.body)); return new Response('{"ok":true}'); }
    const rel = url.replace('/api/state/', '');
    if (rel === 'calendar.json') return new Response(JSON.stringify(saved ?? current));
    if (rel in pending) await pending[rel];
    if (rel in errors) return new Response(JSON.stringify({ error: `Failed: ${rel}` }), { status: errors[rel] });
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

  it('keeps Reopen disabled and shows the error when a season summary fails to load', async () => {
    errors['leagues/fba/S79/summary.json'] = 500;
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    expect(await screen.findByText(/Couldn't check whether S79 is finished/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /reopen previous step/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps Reopen disabled until both season summaries are known', async () => {
    let release!: () => void;
    pending['leagues/fba/S79/summary.json'] = new Promise<void>(r => { release = r; });
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    const reopen = await screen.findByRole('button', { name: /reopen previous step/i }) as HTMLButtonElement;
    expect(reopen.disabled).toBe(true);
    release();
    await waitFor(() => expect(reopen.disabled).toBe(false));
  });
});

describe('CalendarPage FBAJC gate', () => {
  const atFbajc = { season: 79, steps: [
    { id: 'adjust-college-ratings', label: 'Adjust College Ratings', kind: 'offseason', league: null, sub: true, done: true },
    { id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: false },
  ] };
  const board = (committedTo: string | null) => ({
    league: 'fbajc', season: 79, classOf: 80, locked: false, classDraft: [], created: true,
    recruits: [{ playerId: 'p01914', position: 'PG', classYear: 'Fr', rating: null, stars: null, projections: {}, committedTo }],
    portal: [],
  });
  const markDone = async () => screen.findByRole('button', { name: /mark "FBAJC" done/i }) as Promise<HTMLButtonElement>;

  it('keeps Mark done off while anyone is uncommitted', async () => {
    current = atFbajc;
    extra['leagues/fbajc/S79/recruiting.json'] = board(null);
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    expect(await screen.findByText("1 recruit and 0 portal players haven't committed yet")).toBeTruthy();
    expect((await markDone()).disabled).toBe(true);
  });

  it('allows Mark done once everyone has committed', async () => {
    current = atFbajc;
    extra['leagues/fbajc/S79/recruiting.json'] = board('DUKE');
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    const button = await markDone();
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('has no gate without a recruiting doc', async () => {
    current = atFbajc;
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    const button = await markDone();
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('keeps Mark done off when the recruiting doc fails to load', async () => {
    current = atFbajc;
    errors['leagues/fbajc/S79/recruiting.json'] = 500;
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    expect(await screen.findByText(/Couldn't check recruiting/)).toBeTruthy();
    expect((await markDone()).disabled).toBe(true);
  });
});
