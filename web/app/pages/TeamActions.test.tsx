// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOC_KEYS, docPath } from '../../engine/roster/state';
import { baseState } from '../../engine/roster/testFixtures';
import { TeamPage } from './TeamPage';
import { TransactionsPage } from './TransactionsPage';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
let posted: { label: string; writes: { path: string; doc: unknown }[] } | null = null;

beforeEach(() => {
  posted = null;
  const s = baseState();
  s.fbaTx = { ...s.fbaTx, entries: [{ seq: 1, batchId: 'b0', type: 'signed', teams: ['CAR'], lines: ['Signed C-Azubuike Okoro (2/$2, thru S80)'] }] };
  const d: Record<string, unknown> = {
    'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    'leagues/fba/teams.json': { league: 'fba', teams: ['BOS', 'CAR', 'MON'].map(t => ({ teamId: t, name: `${t} Team`, abbr: t, group: 'E', logoFolder: null, badge })) },
  };
  for (const k of DOC_KEYS) d[docPath(k, 79)] = s[k];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') { posted = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ ok: true, batchId: '1-0' })); }
    const doc = d[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc)) : new Response('{}', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/league/:league/team/:teamId" element={<TeamPage />} />
      <Route path="/league/:league/transactions" element={<TransactionsPage />} />
    </Routes>
  </MemoryRouter>,
);

describe('team page actions', () => {
  it('shows payroll and contract tags', async () => {
    renderAt('/league/fba/team/MON');
    expect(await screen.findByText('Payroll $6 / $25')).toBeTruthy();
    expect((await screen.findAllByText('Restricted')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Expired')).toBeTruthy();
  });

  it('releases a player after confirming', async () => {
    renderAt('/league/fba/team/BOS');
    const row = (await screen.findByText('Yasin Milovanovic')).closest('tr')!;
    fireEvent.click(await within(row).findByRole('button', { name: 'Release' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Confirm release' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.label).toBe('Release Yasin Milovanovic (BOS)');
  });

  it('edits a rating', async () => {
    renderAt('/league/fba/team/BOS');
    const row = (await screen.findByText('Gabriel Greenwood')).closest('tr')!;
    fireEvent.click(await within(row).findByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('region', { name: /edit gabriel greenwood/i });
    fireEvent.change(within(dialog).getByLabelText('Rating'), { target: { value: '96' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.label).toBe('Edit Gabriel Greenwood');
  });

  it('resets the edit dialog when switching players without cancelling', async () => {
    renderAt('/league/fba/team/BOS');
    const row1 = (await screen.findByText('Gabriel Greenwood')).closest('tr')!;
    fireEvent.click(await within(row1).findByRole('button', { name: 'Edit' }));
    const row2 = screen.getByText('Olufemi Cisneros').closest('tr')!;
    fireEvent.click(within(row2).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('region', { name: /edit olufemi cisneros/i });
    expect((within(dialog).getByLabelText('Rating') as HTMLInputElement).value).toBe('94');
  });

  it('lists transactions newest first', async () => {
    renderAt('/league/fba/transactions');
    expect(await screen.findByText('Signed C-Azubuike Okoro (2/$2, thru S80)')).toBeTruthy();
  });
});
