// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PastTransactionsFile, PlayersFile, Team, TransactionsFile } from '../../engine/shared/types';
import { PastTransactionsPage } from './PastTransactionsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const team = (teamId: string, name: string, abbr: string): Team => ({ teamId, name, abbr, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams = { league: 'fba', teams: [team('CIN', 'Cincinnati', 'CIN'), team('SEA', 'Seattle', 'SEA'), team('DEN', 'Denver', 'DEN')] };
const players: PlayersFile = { nextId: 2, players: { p00001: { id: 'p00001', name: 'Ray Allen', birthSeason: 50 } } };
const asset = (text: string, playerId: string | null = null) => ({ text, pos: playerId ? 'PG' : null, name: playerId ? 'Ray Allen' : null, playerId });
const past: PastTransactionsFile = {
  seasons: [
    { season: 20, entries: [{ kind: 'cut', teamId: 'DEN', when: null, asset: asset('Old Guy') }] },
    {
      season: 33,
      entries: [
        { kind: 'trade', teamIds: ['CIN', 'SEA'], when: 'Before Week 7', notes: ['Pending review'], moves: [{ to: 'CIN', asset: asset('PG Ray Allen', 'p00001') }, { to: 'SEA', asset: asset('2nd round pick') }] },
        { kind: 'trade', teamIds: ['SEA', 'DEN'], when: 'Offseason', notes: [], moves: [{ to: 'DEN', asset: asset('Cash') }] },
        { kind: 'cut', teamId: 'SEA', when: 'Week 2', asset: asset('Bob Cut') },
      ],
    },
  ],
};
const appTx: TransactionsFile = {
  league: 'fba', season: 79, entries: [
    { seq: 1, batchId: 'b1', type: 'signed', teams: ['SEA'], lines: ['Seattle signed Zed Free'] },
    { seq: 2, batchId: 'b2', type: 'lottery' as never, teams: [], lines: ['Hidden lottery line'] },
  ],
};

function stub(opts: { past?: boolean; app?: boolean; franchises?: boolean; pastFail?: boolean } = {}) {
  const docs: Record<string, unknown> = {
    '/api/state/players.json': players,
    '/api/state/meta.json': { currentSeason: 79 },
    '/api/state/leagues/fba/teams.json': teams,
  };
  if (opts.past !== false) docs['/api/state/leagues/fba/pastTransactions.json'] = past;
  if (opts.app) docs['/api/state/leagues/fba/S79/transactions.json'] = appTx;
  if (opts.franchises) docs['/api/state/leagues/fba/franchises.json'] = { franchises: [{ teamId: 'CIN', eras: [{ name: 'Cincinnati', abbr: 'OCI', city: 'Cincinnati', from: 1, to: null }] }] };
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    opts.pastFail && url === '/api/state/leagues/fba/pastTransactions.json' ? new Response('boom', { status: 500 }) :
    url in docs ? new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } }) : new Response('{}', { status: 404 })));
}

const renderAt = (qs: string) => render(
  <MemoryRouter initialEntries={[`/history/fba/transactions${qs}`]}>
    <Routes><Route path="/history/fba/transactions" element={<PastTransactionsPage />} /></Routes>
  </MemoryRouter>,
);

describe('PastTransactionsPage', () => {
  it('defaults to the newest imported season and shows a trade card with a player link', async () => {
    stub();
    renderAt('');
    expect(await screen.findByText('Before Week 7')).toBeTruthy();
    expect((screen.getByLabelText('Season') as HTMLSelectElement).value).toBe('33');
    const card = screen.getByText('Before Week 7').closest('article') as HTMLElement;
    expect(card.className).toContain('tx-trade');
    expect(within(card).getByRole('link', { name: 'Ray Allen' }).getAttribute('href')).toBe('/history/fba/players/p00001');
    expect(card.textContent).toContain('⇄');
    expect(card.textContent).toContain('Pending review');
  });

  it('lists team moves in a table with a capitalised label', async () => {
    stub();
    renderAt('?season=33');
    const cell = await screen.findByText('Cut');
    expect(cell.closest('tr')?.textContent).toContain('Bob Cut');
    expect(cell.closest('tr')?.textContent).toContain('Week 2');
  });

  it('filters by team', async () => {
    stub();
    renderAt('?season=33&team=CIN');
    await screen.findByText('Before Week 7');
    expect(screen.queryByText('Offseason')).toBeNull();
    expect(screen.queryByText('Bob Cut')).toBeNull();
  });

  it('shows app moves for season 79, only the listed types', async () => {
    stub({ app: true });
    renderAt('?season=79');
    expect(await screen.findByText('Moves in the app')).toBeTruthy();
    expect(screen.getByText('Seattle signed Zed Free')).toBeTruthy();
    expect(screen.queryByText('Hidden lottery line')).toBeNull();
  });

  it('shows the import hint when nothing exists', async () => {
    stub({ past: false });
    renderAt('');
    expect(await screen.findByText('No past transactions yet. Run npm run import -- --transactions --data data.')).toBeTruthy();
  });

  it('uses the era code on every line of a trade card', async () => {
    stub({ franchises: true });
    renderAt('?season=33');
    const card = (await screen.findByText('Before Week 7')).closest('article') as HTMLElement;
    expect(card.textContent).toMatch(/→ [A-Z]*OCI:/);
    expect(card.textContent).not.toContain('CINCIN');
  });

  it('keeps the season select in step with an unlisted ?season=', async () => {
    stub();
    renderAt('?season=12');
    await screen.findByText('No transactions on record for S12.');
    expect((screen.getByLabelText('Season') as HTMLSelectElement).value).toBe('12');
  });

  it('shows an error when the past transactions fail to load', async () => {
    stub({ pastFail: true });
    renderAt('');
    expect((await screen.findByText(/Couldn't load the transactions/)).className).toBe('error');
  });
});
