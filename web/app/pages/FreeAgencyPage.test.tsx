// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { docPath, DOC_KEYS } from '../../engine/roster/state';
import { baseState } from '../../engine/roster/testFixtures';
import { FreeAgencyPage } from './FreeAgencyPage';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
let posted: { label: string; writes: { path: string; doc: unknown }[] } | null = null;

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
    return doc ? new Response(JSON.stringify(doc)) : new Response('{}', { status: 404 });
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
    fireEvent.click(await screen.findByText('Azubuike Okoro'));
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

  it('shows what blocks closing free agency', async () => {
    renderPage();
    expect(await screen.findByText('CAR: no C')).toBeTruthy();
    expect((screen.getByRole('button', { name: /close free agency/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
