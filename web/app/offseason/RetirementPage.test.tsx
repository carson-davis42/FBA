// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RETIREMENT_STEP } from '../../engine/offseason/retirement';
import { baseState } from '../../engine/roster/testFixtures';
import { DOC_KEYS, docPath } from '../../engine/roster/state';
import { calendarFor } from '../../engine/shared/calendar';
import type { CalendarFile, Player } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { RetirementPage } from './RetirementPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const META = { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } };

/** Every step before `stepId` is done (`after` includes the step itself). */
const calendarAt = (stepId: string, after = false): CalendarFile => {
  const cal = calendarFor(79);
  const at = cal.steps.findIndex(s => s.id === stepId) + (after ? 1 : 0);
  return { ...cal, steps: cal.steps.map((s, i) => ({ ...s, done: i < at })) };
};

// Ages at S79: p00001 (BOS PG) 33 (auto), p00006 (CAR PG) 31, p00021 (AMS SG) 31; the rest have no birth season.
const BIRTH: Record<string, number> = { p00001: 46, p00006: 48, p00021: 48 };

function docs(calendar: CalendarFile): Record<string, unknown> {
  const base = baseState();
  const players = Object.fromEntries(Object.entries(base.players.players).map(([id, p]): [string, Player] => [id, { ...p, birthSeason: BIRTH[id] ?? null }]));
  const state = { ...base, players: { ...base.players, players } };
  const out: Record<string, unknown> = { 'meta.json': META, 'calendar.json': calendar };
  for (const k of DOC_KEYS) out[docPath(k, 79)] = state[k];
  return out;
}

const renderPage = () => render(<MemoryRouter><RetirementPage /></MemoryRouter>);

describe('RetirementPage', () => {
  it('lists the age-32+ players without a remove control', async () => {
    stubApi(docs(calendarAt(RETIREMENT_STEP)));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'S79 Retirement' })).toBeTruthy();
    const row = (await screen.findByText('Gabriel Greenwood')).closest('tr')!;
    expect(row.textContent).toContain('PG');
    expect(row.textContent).toContain('BOS');
    expect(row.textContent).toContain('FBA');
    expect(row.textContent).toContain('33');
    expect(within(row).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('warns about players with an unknown age', async () => {
    stubApi(docs(calendarAt(RETIREMENT_STEP)));
    renderPage();
    const note = (await screen.findByText(/Unknown age/)).closest('.muted')!;
    expect(note.textContent).toContain("Koa'e Keano");
    expect(note.textContent).not.toContain('Jelani Soweto');
  });

  it('adds an early retirement from the search and removes it again', async () => {
    stubApi(docs(calendarAt(RETIREMENT_STEP)));
    renderPage();
    const input = await screen.findByLabelText('Add an early retirement');
    fireEvent.change(input, { target: { value: 'Je' } });
    expect(screen.queryByRole('list', { name: 'Search results' })).toBeNull();
    fireEvent.change(input, { target: { value: 'jel' } });
    const results = screen.getByRole('list', { name: 'Search results' });
    expect(within(results).getByText(/Jelani Soweto/)).toBeTruthy();
    // Already-listed players are not offered.
    fireEvent.change(input, { target: { value: 'gabriel' } });
    expect(screen.queryByRole('list', { name: 'Search results' })).toBeNull();
    fireEvent.change(input, { target: { value: 'jelani' } });
    fireEvent.click(within(screen.getByRole('list', { name: 'Search results' })).getByRole('button', { name: 'Add' }));
    const row = screen.getAllByText('Jelani Soweto').map(el => el.closest('tr')).find(Boolean)!;
    expect(row.textContent).toContain('31');
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retire 2 players' })).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('button', { name: 'Retire 1 player' })).toBeTruthy();
  });

  it('adds an unknown-age player from the warning note', async () => {
    stubApi(docs(calendarAt(RETIREMENT_STEP)));
    renderPage();
    const note = (await screen.findByText(/Unknown age/)).closest('.muted') as HTMLElement;
    const item = within(note).getByText(/Koa'e Keano/).closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Retire 2 players' })).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText("Koa'e Keano")).toBeTruthy();
  });

  it('posts one batch with the roster, players, transactions and calendar documents', async () => {
    const log = stubApi(docs(calendarAt(RETIREMENT_STEP)));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Retire 1 player' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    const paths = log.batches[0].writes.map(w => w.path);
    expect(paths).toContain('players.json');
    expect(paths).toContain('calendar.json');
    expect(paths).toContain('leagues/fba/S79/rosters.json');
    expect(log.batches[0].writes.every(w => w.baseVersion === '0000000000000001')).toBe(true);
    expect(await screen.findByText('Retirement is done for S79.')).toBeTruthy();
    expect(log.batches).toHaveLength(1);
  });

  it('disables the button with the calendar problem when the step is not current', async () => {
    stubApi(docs(calendarFor(79)));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Retire 1 player' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Players retire at the Retirement step/)).toBeTruthy();
  });

  it('says retirement is done once the step is done', async () => {
    stubApi(docs(calendarAt(RETIREMENT_STEP, true)));
    renderPage();
    expect(await screen.findByText('Retirement is done for S79.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Retire / })).toBeNull();
  });
});
