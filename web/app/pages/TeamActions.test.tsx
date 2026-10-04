// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOC_KEYS, docPath } from '../../engine/roster/state';
import { baseState } from '../../engine/roster/testFixtures';
import { TeamPage } from './TeamPage';
import { TransactionsPage } from './TransactionsPage';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
let posted: { label: string; writes: { path: string; doc: unknown; baseVersion: string | null }[] } | null = null;
let docs: Record<string, unknown>;

beforeEach(() => {
  posted = null;
  const s = baseState();
  s.fbaTx = { ...s.fbaTx, entries: [{ seq: 1, batchId: 'b0', type: 'signed', teams: ['CAR'], lines: ['Signed C-Azubuike Okoro (2/$2, thru S80)'] }] };
  const d: Record<string, unknown> = docs = {
    'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    'leagues/fbajc/teams.json': { league: 'fbajc', teams: [{ teamId: 'DUKE', name: 'Duke', abbr: 'DUKE', group: 'ACC', logoFolder: null, badge }] },
    'leagues/fbajc/S78/rosters.json': { league: 'fbajc', season: 78, locked: true, teams: { DUKE: [] } },
    'leagues/fbawc/teams.json': { league: 'fbawc', teams: [{ teamId: 'MEX', name: 'Mexico', abbr: 'MEX', group: null, logoFolder: null, badge }] },
    'leagues/fbawc/S78/rosters.json': { league: 'fbawc', season: 78, locked: true, teams: { MEX: [] } },
    'leagues/fba/teams.json': { league: 'fba', teams: ['BOS', 'CAR', 'MON'].map(t => ({ teamId: t, name: `${t} Team`, abbr: t, group: 'E', logoFolder: null, badge })) },
  };
  for (const k of DOC_KEYS) d[docPath(k, 79)] = s[k];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') { posted = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ ok: true, batchId: '1-0' })); }
    const doc = d[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"0123456789abcdef"' } }) : new Response('{}', { status: 404 });
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
  it('links the FBA team page to the franchise history', async () => {
    renderAt('/league/fba/team/MON');
    const link = await screen.findByRole('link', { name: 'Franchise history' });
    expect(link.getAttribute('href')).toBe('/history/fba/teams/MON');
  });

  it('links a college team page to the school history', async () => {
    renderAt('/league/fbajc/team/DUKE');
    const link = await screen.findByRole('link', { name: 'School history' });
    expect(link.getAttribute('href')).toBe('/history/fbajc/schools/DUKE');
    expect(screen.queryByRole('link', { name: 'Franchise history' })).toBeNull();
  });

  it('links a national team page to the team history', async () => {
    renderAt('/league/fbawc/team/MEX');
    const link = await screen.findByRole('link', { name: 'Team history' });
    expect(link.getAttribute('href')).toBe('/history/fbawc/teams/MEX');
  });

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
    const txWrite = posted!.writes.find(w => w.path === 'leagues/fba/S79/transactions.json');
    const entries = (txWrite!.doc as { entries: { lines: string[] }[] }).entries;
    expect(entries.at(-1)!.lines).toEqual(['Edited PG-Gabriel Greenwood: rating 95→96']);
  });

  it('extends an active contract and records the salary decrease in the same batch', async () => {
    renderAt('/league/fba/team/BOS');
    const row = (await screen.findByText('Gabriel Greenwood')).closest('tr')!;
    fireEvent.click(await within(row).findByRole('button', { name: 'Extend' }));
    const dialog = screen.getByRole('region', { name: 'Extend Gabriel Greenwood' });
    expect(within(dialog).getByText(/S80 → S81/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Amount ($)'), { target: { value: '7' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Extend contract' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.label).toBe('Extend Gabriel Greenwood (BOS)');
    expect(posted!.writes.map(w => w.path)).toEqual(['leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json']);
    expect(posted!.writes.map(w => w.baseVersion)).toEqual(['0123456789abcdef', '0123456789abcdef']);
    const roster = posted!.writes[0].doc as { teams: { BOS: { contractEnd: number; contractAmount: number }[] } };
    expect(roster.teams.BOS[0]).toMatchObject({ contractEnd: 81, contractAmount: 7 });
    expect(screen.queryByRole('region', { name: 'Extend Gabriel Greenwood' })).toBeNull();
  });

  it('disables an extension that violates length versus pay', async () => {
    renderAt('/league/fba/team/MON');
    const row = (await screen.findByText('Milo Lawrenz')).closest('tr')!;
    fireEvent.click(await within(row).findByRole('button', { name: 'Extend' }));
    const dialog = screen.getByRole('region', { name: 'Extend Milo Lawrenz' });
    expect(within(dialog).getByText("Years can't exceed dollars (3 years needs at least $3)")).toBeTruthy();
    const save = within(dialog).getByRole('button', { name: 'Extend contract' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(posted).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Amount ($)'), { target: { value: '3' } });
    expect(save.disabled).toBe(false);
  });

  it('offers extensions after the trade deadline while other roster actions are locked', async () => {
    docs['leagues/fba/S79/freeAgents.json'] = { ...baseState().freeAgents, locked: true };
    docs['leagues/fba/S79/schedule.json'] = { league: 'fba', season: 79, locked: false, games: [], pauses: [{ kind: 'deadline', done: true }] };
    renderAt('/league/fba/team/BOS');
    const row = (await screen.findByText('Gabriel Greenwood')).closest('tr')!;
    fireEvent.click(await within(row).findByRole('button', { name: 'Extend' }));
    expect(within(row).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Release' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Extend contract' }));
    await waitFor(() => expect(posted?.label).toBe('Extend Gabriel Greenwood (BOS)'));
  });

  it('does not offer Extend for expired contracts or final rosters', async () => {
    docs['leagues/fba/S79/rosters.json'] = { ...baseState().fba, locked: true };
    renderAt('/league/fba/team/BOS');
    await screen.findByText('Gabriel Greenwood');
    expect(screen.queryByRole('button', { name: 'Extend' })).toBeNull();
  });

  it('keeps expired players on the re-sign flow', async () => {
    renderAt('/league/fba/team/MON');
    const row = (await screen.findByText('Dan Price')).closest('tr')!;
    expect(await within(row).findByRole('button', { name: 'Re-sign' })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Extend' })).toBeNull();
  });

  it('resets extension pay when switching players', async () => {
    renderAt('/league/fba/team/BOS');
    const first = (await screen.findByText('Gabriel Greenwood')).closest('tr')!;
    fireEvent.click(await within(first).findByRole('button', { name: 'Extend' }));
    fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '6' } });
    const second = screen.getByText('Yasin Milovanovic').closest('tr')!;
    fireEvent.click(within(second).getByRole('button', { name: 'Extend' }));
    const dialog = screen.getByRole('region', { name: 'Extend Yasin Milovanovic' });
    expect((within(dialog).getByLabelText('Amount ($)') as HTMLInputElement).value).toBe('7');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Extend Yasin Milovanovic' })).toBeNull();
    expect(posted).toBeNull();
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

  it('re-signs a restricted, expired player via the Re-sign button', async () => {
    renderAt('/league/fba/team/MON');
    const row = (await screen.findByText('Dan Price')).closest('tr')!;
    fireEvent.click(await within(row).findByRole('button', { name: 'Re-sign' }));
    const panel = screen.getByRole('region', { name: /sign dan price/i });
    expect((within(panel).getByLabelText('Team') as HTMLSelectElement).value).toBe('MON');
    fireEvent.change(within(panel).getByLabelText('Years'), { target: { value: '5' } });
    fireEvent.change(within(panel).getByLabelText('Amount ($)'), { target: { value: '5' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Sign' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.label).toBe('Re-sign Dan Price → MON');
  });

  it('lists transactions newest first', async () => {
    renderAt('/league/fba/transactions');
    expect(await screen.findByText((_, el) => el?.className === 'tx-line' && el.textContent === 'Signed C-Azubuike Okoro (2/$2, thru S80)')).toBeTruthy();
  });
});
