// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signPlayer } from '../../engine/roster/moves';
import { docPath, DOC_KEYS } from '../../engine/roster/state';
import { baseState } from '../../engine/roster/testFixtures';
import { FreeAgencyPage } from './FreeAgencyPage';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
let posted: { label: string; writes: { path: string; doc: unknown; baseVersion: string | null }[] } | null = null;

function docs(): Record<string, unknown> {
  const s = baseState();
  const out: Record<string, unknown> = {
    'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    'calendar.json': { season: 79, steps: [{ id: 'free-agency-offseason', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false }] },
    'leagues/fba/teams.json': { league: 'fba', teams: ['BOS', 'CAR', 'MON'].map(t => ({ teamId: t, name: `${t} Team`, abbr: t, group: 'E', logoFolder: null, badge })) },
  };
  for (const k of DOC_KEYS) out[docPath(k, 79)] = s[k];
  return out;
}

beforeEach(() => {
  posted = null;
  const d = docs();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') { posted = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ ok: true, batchId: '1-0' })); }
    const doc = d[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"00000000000000aa"' } }) : new Response('{}', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(
  <MemoryRouter initialEntries={['/league/fba/free-agency']}>
    <Routes><Route path="/league/:league/free-agency" element={<FreeAgencyPage />} /></Routes>
  </MemoryRouter>,
);

describe('FreeAgencyPage', () => {
  it('lists the market with types', async () => {
    renderPage();
    expect(await screen.findByText('Azubuike Okoro')).toBeTruthy();
    expect(screen.getByText('Milan Tepic')).toBeTruthy();
    expect(screen.getByText('Maddox Dean')).toBeTruthy();
    expect(screen.getByText("Koa'e Keano")).toBeTruthy();
  });

  it('filters by team needs', async () => {
    renderPage();
    await screen.findByText('Azubuike Okoro');
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'CAR' } });
    expect(screen.getByText(/Open: C/)).toBeTruthy();
    expect(screen.queryByText('Mubiru Okeke')).toBeNull();
    expect(screen.getByText('Azubuike Okoro')).toBeTruthy();
  });

  it('signs a player through the sign panel', async () => {
    renderPage();
    fireEvent.click((await screen.findByText('Azubuike Okoro')).closest('tr')!);
    const panel = screen.getByRole('region', { name: /sign azubuike okoro/i });
    fireEvent.change(within(panel).getByLabelText('Team'), { target: { value: 'CAR' } });
    fireEvent.change(within(panel).getByLabelText('Years'), { target: { value: '2' } });
    fireEvent.change(within(panel).getByLabelText('Amount ($)'), { target: { value: '3' } });
    expect(within(panel).getByText('Payroll would be $26 (cap $25)')).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText('Amount ($)'), { target: { value: '2' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Sign' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.label).toBe('Sign Azubuike Okoro → CAR');
    expect(posted!.writes.map(w => w.path).sort()).toEqual(['leagues/fba/S79/freeAgents.json', 'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json']);
  });

  it('sends the loaded version with every write', async () => {
    renderPage();
    fireEvent.click((await screen.findByText('Azubuike Okoro')).closest('tr')!);
    const panel = screen.getByRole('region', { name: /sign azubuike okoro/i });
    fireEvent.change(within(panel).getByLabelText('Team'), { target: { value: 'CAR' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Sign' }));
    await waitFor(() => expect(posted).not.toBeNull());
    for (const w of posted!.writes) expect(w.baseVersion).toBe('00000000000000aa');
  });

  it('shows what blocks closing free agency', async () => {
    renderPage();
    expect(await screen.findByText('CAR: no C')).toBeTruthy();
    expect((screen.getByRole('button', { name: /close free agency/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('posts calendar.json at its loaded version when closing free agency succeeds', async () => {
    // Build the same fixture as the engine test "moves unsigned free agents to D2 Reserves":
    // sign every remaining opening so freeAgencyBlockers(s) is empty and Close free agency can run.
    let s = baseState();
    const ctx = { batchId: 'b1' };
    const sign = (input: Parameters<typeof signPlayer>[1]) => {
      const r = signPlayer(s, input, ctx);
      if (!r.ok) throw new Error(r.problems.join('; '));
      s = r.state;
    };
    sign({ playerId: 'p00003', teamId: 'BOS', years: 1, amount: 1, conflict: 'keep' });
    sign({ playerId: 'p00004', teamId: 'BOS', years: 1, amount: 1, conflict: 'keep' });
    sign({ playerId: 'p00030', teamId: 'CAR', years: 1, amount: 1, conflict: 'keep' });
    sign({ playerId: 'p00012', teamId: 'MON', years: 1, amount: 1, conflict: 'keep' });
    sign({ playerId: 'p00021', teamId: 'MON', years: 1, amount: 1, rating: 70, conflict: 'keep' });

    const closable: Record<string, unknown> = {
      'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
      'calendar.json': { season: 79, steps: [{ id: 'free-agency-offseason', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false }] },
      'leagues/fba/teams.json': { league: 'fba', teams: ['BOS', 'CAR', 'MON'].map(t => ({ teamId: t, name: `${t} Team`, abbr: t, group: 'E', logoFolder: null, badge })) },
    };
    for (const k of DOC_KEYS) closable[docPath(k, 79)] = s[k];

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/batch') { posted = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ ok: true, batchId: '1-0' })); }
      const doc = closable[url.replace('/api/state/', '')];
      return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"00000000000000aa"' } }) : new Response('{}', { status: 404 });
    }));

    renderPage();
    const button = await screen.findByRole('button', { name: /close free agency/i }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.label).toBe('Close free agency');
    const calWrite = posted!.writes.find(w => w.path === 'calendar.json');
    expect(calWrite).toBeTruthy();
    expect(calWrite!.baseVersion).toBe('00000000000000aa');
  });
});
