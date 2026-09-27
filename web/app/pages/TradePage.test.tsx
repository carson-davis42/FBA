// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOC_KEYS, docPath } from '../../engine/roster/state';
import { baseState } from '../../engine/roster/testFixtures';
import { TradePage } from './TradePage';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
let posted: { label: string; writes: { path: string; doc: unknown }[] } | null = null;

beforeEach(() => {
  posted = null;
  const s = baseState();
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

describe('TradePage', () => {
  it('builds a player-for-pick trade and saves it', async () => {
    render(
      <MemoryRouter initialEntries={['/trade/fba?team=CAR']}>
        <Routes><Route path="/trade/:league" element={<TradePage />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('Add team'), { target: { value: 'MON' } });
    const car = screen.getByRole('region', { name: 'CAR Team' });
    const mon = screen.getByRole('region', { name: 'MON Team' });
    fireEvent.click(within(car).getByText('Terence Hopkins'));
    fireEvent.click(within(mon).getByText('S81 own pick'));
    fireEvent.change(within(mon).getByLabelText('S81 condition'), { target: { value: 'top' } });
    fireEvent.change(within(mon).getByLabelText('S81 protected top'), { target: { value: '4' } });
    expect(screen.getByText('->MON SG-Terence Hopkins')).toBeTruthy();
    expect(screen.getByText('->CAR S81 Draft Pick(via MON)(4P)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make trade' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.label).toBe('Trade CAR/MON');
    expect(posted!.writes.map(w => w.path).sort()).toEqual(['leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json', 'leagues/fba/picks.json']);
  });
});
