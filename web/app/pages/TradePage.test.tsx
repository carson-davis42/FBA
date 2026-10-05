// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOC_KEYS, docPath } from '../../engine/roster/state';
import { baseState } from '../../engine/roster/testFixtures';
import { TradePage } from './TradePage';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
let posted: { label: string; writes: { path: string; doc: unknown }[] } | null = null;

function setupFetch(build: (s: ReturnType<typeof baseState>) => void = () => {}, extra: Record<string, unknown> = {}) {
  posted = null;
  const s = baseState();
  build(s);
  const d: Record<string, unknown> = {
    'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    'leagues/fba/teams.json': { league: 'fba', teams: ['BOS', 'CAR', 'MON'].map(t => ({ teamId: t, name: `${t} Team`, abbr: t, group: 'E', logoFolder: null, badge })) },
    'leagues/fbad2/teams.json': { league: 'fbad2', teams: [{ teamId: 'AMS', name: 'AMS Team', abbr: 'AMS', group: 'PL', logoFolder: null, badge }] },
  };
  for (const k of DOC_KEYS) d[docPath(k, 79)] = s[k];
  Object.assign(d, extra);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') { posted = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ ok: true, batchId: '1-0' })); }
    const doc = d[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc)) : new Response('{}', { status: 404 });
  }));
}

beforeEach(() => setupFetch());
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
    fireEvent.click(within(car).getByText('Terence Hopkins').closest('span')!);
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

  describe('fewer than 2 teams', () => {
    it('shows a hint instead of starting a trade when clicking an asset', async () => {
      render(
        <MemoryRouter initialEntries={['/trade/fba?team=CAR']}>
          <Routes><Route path="/trade/:league" element={<TradePage />} /></Routes>
        </MemoryRouter>,
      );
      const car = await screen.findByRole('region', { name: 'CAR Team' });
      expect(screen.getByText('Add a second team to start a trade.')).toBeTruthy();
      fireEvent.click(within(car).getByText('Terence Hopkins').closest('span')!);
      expect(within(car).getByText('Terence Hopkins').closest('.asset')?.className).not.toContain('sending');
      expect(screen.getByText('Add a second team to start a trade.')).toBeTruthy();
    });
  });

  describe('3+ team trades', () => {
    beforeEach(() => {
      setupFetch(s => {
        s.picks = {
          league: 'fba',
          obligations: [{
            id: 'imp-S81-MON-1', season: 81, originalTeam: 'MON', owner: 'CAR',
            condition: { kind: 'top', n: 4 }, originalCondition: { kind: 'top', n: 4 },
            originSeason: 81, priority: 1, rolls: [], note: '',
          }],
        };
      });
    });

    it('lets you choose a destination for a player and an owned pick', async () => {
      render(
        <MemoryRouter initialEntries={['/trade/fba?team=CAR']}>
          <Routes><Route path="/trade/:league" element={<TradePage />} /></Routes>
        </MemoryRouter>,
      );
      fireEvent.change(await screen.findByLabelText('Add team'), { target: { value: 'MON' } });
      fireEvent.change(screen.getByLabelText('Add team'), { target: { value: 'BOS' } });
      const car = screen.getByRole('region', { name: 'CAR Team' });
      fireEvent.click(within(car).getByText('S81 Draft Pick(via MON)(4P)'));
      fireEvent.change(within(car).getByLabelText('Send S81 Draft Pick(via MON)(4P) to'), { target: { value: 'BOS' } });
      fireEvent.click(within(car).getByText('Terence Hopkins').closest('span')!);
      fireEvent.change(within(car).getByLabelText('Send Terence Hopkins to'), { target: { value: 'MON' } });
      expect(screen.getByText('->BOS S81 Draft Pick(via MON)(4P)')).toBeTruthy();
      expect(screen.getByText('->MON SG-Terence Hopkins')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Make trade' }));
      await waitFor(() => expect(posted).not.toBeNull());
      expect(posted!.label).toBe('Trade CAR/MON/BOS');
    });
  });

  describe('locked rosters', () => {
    beforeEach(() => {
      setupFetch(s => { s.fba = { ...s.fba, locked: true }; });
    });

    it('shows rosters as read-only and disables Make trade', async () => {
      render(
        <MemoryRouter initialEntries={['/trade/fba?team=CAR']}>
          <Routes><Route path="/trade/:league" element={<TradePage />} /></Routes>
        </MemoryRouter>,
      );
      expect(await screen.findByText('S79 rosters are final; trades are closed.')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Make trade' }) as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('FBAD2', () => {
    it('has no draft picks section', async () => {
      render(
        <MemoryRouter initialEntries={['/trade/fbad2?team=AMS']}>
          <Routes><Route path="/trade/:league" element={<TradePage />} /></Routes>
        </MemoryRouter>,
      );
      await screen.findByText('AMS Team');
      expect(screen.queryByText('Draft picks')).toBeNull();
    });
  });
});

describe('TradePage roster locks', () => {
  it("doesn't say rosters are final during the D2 cycle, when the roster file itself isn't locked (F9)", async () => {
    setupFetch(s => { s.freeAgents = { ...s.freeAgents, locked: true }; });
    render(
      <MemoryRouter initialEntries={['/trade/fbad2?team=AMS']}>
        <Routes><Route path="/trade/:league" element={<TradePage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('D2 rosters are locked from the close of free agency until the next offseason')).toBeTruthy();
    expect(screen.queryByText(/rosters are final/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Make trade' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('is read-only after the trade deadline', async () => {
    setupFetch(s => { s.freeAgents = { ...s.freeAgents, locked: true }; }, {
      'leagues/fba/S79/schedule.json': { league: 'fba', season: 79, locked: false, games: [], pauses: [{ afterGame: 645, kind: 'deadline', done: true }] },
      'leagues/fba/S79/results.json': { league: 'fba', season: 79, locked: false, games: [] },
    });
    render(
      <MemoryRouter initialEntries={['/trade/fba?team=CAR']}>
        <Routes><Route path="/trade/:league" element={<TradePage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('The trade deadline has passed: roster moves are locked until the offseason; FBA contract extensions remain available')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Make trade' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
