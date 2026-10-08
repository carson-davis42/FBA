// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import type { ContestResult, Dice, ExhibitionGame } from '../../engine/shared/types';
import { AllStarPage } from './AllStarPage';
import { DiceReveal, StaticLines } from './DiceReveal';
import { contestLines, gameResultText } from './EventSteps';
import { allStarSeasonState, type Stage } from './testState';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const open = (stage: Stage) => {
  const log = stubApi(seasonDocs(allStarSeasonState(stage)));
  render(<MemoryRouter><AllStarPage /></MemoryRouter>);
  return log;
};

describe('All-Star events', () => {
  it('saves the roll before revealing it, then reveals it roll by roll', async () => {
    const docs = seasonDocs(allStarSeasonState('drawn'));
    const batchBodies: { label: string; writes: { path: string; doc: unknown }[] }[] = [];
    const pending: ((r: Response) => void)[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/batch') {
        const body = JSON.parse(String(init!.body)) as { label: string; writes: { path: string; doc: unknown }[] };
        batchBodies.push(body);
        for (const w of body.writes) docs[w.path] = w.doc;
        return new Promise<Response>(resolve => pending.push(resolve));
      }
      const path = url.replace('/api/state/', '');
      if (!(path in docs)) return Promise.resolve(new Response(JSON.stringify({ error: `Not found: ${path}` }), { status: 404 }));
      return Promise.resolve(new Response(JSON.stringify(docs[path]), { headers: { ETag: '"0000000000000001"' } }));
    }));
    render(<MemoryRouter><AllStarPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Run the 5pt contest' }));
    await waitFor(() => expect(batchBodies).toHaveLength(1));
    expect(batchBodies[0].label).toBe('Run the 5pt contest');
    // The save hasn't resolved yet, so no reveal controls should exist.
    expect(screen.queryByRole('button', { name: 'Roll next' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Roll to end' })).toBeNull();
    pending[0](new Response(JSON.stringify({ ok: true, batchId: '1-0', versions: {} })));
    fireEvent.click(await screen.findByRole('button', { name: 'Roll next' }));
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Roll to end' }));
    expect(await screen.findByRole('button', { name: 'Run the dunk contest' })).toBeTruthy();
  });

  it('shows the saved result as static lines after a remount', async () => {
    const log = open('drawn');
    fireEvent.click(await screen.findByRole('button', { name: 'Run the 5pt contest' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    cleanup();
    render(<MemoryRouter><AllStarPage /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Run the dunk contest' });
    fireEvent.click(screen.getByRole('button', { name: /5pt contest/ }));
    expect(screen.queryByRole('button', { name: 'Roll next' })).toBeNull();
    expect(await screen.findByText(/^Winner:/)).toBeTruthy();
  });

  it('retries a failed save with the same rolled result, without re-rolling', async () => {
    const docs = seasonDocs(allStarSeasonState('drawn'));
    const sent: { writes: { path: string; doc: unknown }[] }[] = [];
    let attempt = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/batch') {
        attempt++;
        const body = JSON.parse(String(init!.body)) as { writes: { path: string; doc: unknown }[] };
        sent.push(body);
        if (attempt === 1) return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
        return new Response(JSON.stringify({ ok: true, batchId: '1-0', versions: {} }));
      }
      const path = url.replace('/api/state/', '');
      if (!(path in docs)) return new Response(JSON.stringify({ error: `Not found: ${path}` }), { status: 404 });
      return new Response(JSON.stringify(docs[path]), { headers: { ETag: '"0000000000000001"' } });
    }));
    render(<MemoryRouter><AllStarPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Run the 5pt contest' }));
    const retryBtn = await screen.findByRole('button', { name: 'Retry save' });
    fireEvent.click(retryBtn);
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].writes[0].doc).toEqual(sent[0].writes[0].doc);
    expect(await screen.findByRole('button', { name: 'Roll next' })).toBeTruthy();
  });

  it('drafts Young-Stars', async () => {
    const log = open('ysgDrafting');
    const board = await screen.findByRole('table', { name: 'Available Young-Stars' });
    fireEvent.click(within(board).getAllByRole('row')[1]);
    fireEvent.click(screen.getByRole('button', { name: /^Pick / }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Young-Star draft pick 1');
  });

  it('plays the All-Star Game and finishes the weekend', async () => {
    const log = open('ysgPlayed');
    fireEvent.click(await screen.findByRole('button', { name: 'Play the All-Star Game' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Play the All-Star Game');
    // The saved game is then watched like any other: possession by possession, with play-by-play and a box score.
    expect(screen.getByRole('heading', { name: 'Play-by-play' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Sim to end' }));
    expect(await screen.findByText(/· MVP/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Play-by-play' })).toBeTruthy();
    cleanup();
    const log2 = open('complete');
    fireEvent.click(await screen.findByRole('button', { name: 'Finish All-Star weekend' }));
    await waitFor(() => expect(log2.batches).toHaveLength(1));
    expect(log2.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/allstar.json', 'leagues/fba/S79/schedule.json']);
  });

  it('runs the Young-Star tournament as a bracket whose games open in the live viewer', async () => {
    const log = open('ysgDrafted');
    fireEvent.click(await screen.findByRole('button', { name: 'Run the Young-Star tournament' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Run the Young-Star tournament');
    const bracket = await screen.findByLabelText('Young-Star bracket');
    const semi1 = within(bracket).getByRole('button', { name: 'Semifinal 1' });
    const final = within(bracket).getByRole('button', { name: 'Final' }) as HTMLButtonElement;
    expect(final.disabled).toBe(true);
    // The first semifinal is open to watch; nothing is decided yet.
    expect(semi1.className).toContain('selected');
    expect(screen.getByRole('heading', { name: 'Play-by-play' })).toBeTruthy();
    expect(semi1.className).not.toContain('decided');
    fireEvent.click(screen.getByRole('button', { name: 'Sim to end' }));
    await waitFor(() => expect(within(bracket).getByRole('button', { name: 'Semifinal 1 (played)' })).toBeTruthy());
    expect((within(bracket).getByRole('button', { name: 'Final' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(bracket).getByRole('button', { name: 'Semifinal 2' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sim to end' }));
    await waitFor(() => expect((within(bracket).getByRole('button', { name: 'Final' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(bracket).getByRole('button', { name: 'Final' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sim to end' }));
    expect(await screen.findByText(/Champions: Team/)).toBeTruthy();
    expect(await screen.findByText(/pts across its games/)).toBeTruthy();
    // The finished bracket stays up (open any game to look back) until the person moves on.
    expect(within(bracket).getByRole('button', { name: 'Final (played)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByLabelText('Young-Star bracket')).toBeNull());
  });

  it('can sim the whole Young-Star tournament at once', async () => {
    open('ysgDrafted');
    fireEvent.click(await screen.findByRole('button', { name: 'Run the Young-Star tournament' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sim the whole tournament' }));
    expect(await screen.findByText(/Champions: Team/)).toBeTruthy();
  });

  it('says when overtime decided a game', () => {
    const game: ExhibitionGame = { teams: [0, 1], rosters: [[], []], plays: [], lineups: [], points: [], scores: [144, 146], ot: 1, winner: 1 };
    expect(gameResultText(game, t => `Team ${t + 1}`)).toBe('Team 2 146–144 (OT)');
    expect(gameResultText({ ...game, scores: [150, 140], ot: 0, winner: 0 }, t => `Team ${t + 1}`)).toBe('Team 1 150–140');
    expect(gameResultText({ ...game, ot: 2 }, t => `Team ${t + 1}`)).toBe('Team 2 146–144 (2OT)');
  });
});

describe('contest and dice reveal order', () => {
  it("shows everyone's first roll, then everyone's second, then their third", () => {
    const d = (a: number, b: number): Dice => [a, b] as Dice;
    const rolls = { p00001: [d(1, 1), d(2, 2), d(3, 3)], p00002: [d(4, 4), d(5, 5), d(6, 6)] };
    const result: ContestResult = {
      winner: 'p00002',
      rounds: [{ players: ['p00001', 'p00002'], rolls, totals: { p00001: 12, p00002: 30 }, advanced: ['p00002'], rollOffs: [] }],
    };
    const lines = contestLines(result, id => id).filter(l => l.dice);
    expect(lines.map(l => l.text)).toEqual(['p00001 roll 1: 2', 'p00002 roll 1: 8', 'p00001 roll 2: 4', 'p00002 roll 2: 10', 'p00001 roll 3: 6', 'p00002 roll 3: 12']);
    expect(lines.map(l => l.group)).toEqual(['Round 1 · Roll 1', 'Round 1 · Roll 1', 'Round 1 · Roll 2', 'Round 1 · Roll 2', 'Round 1 · Roll 3', 'Round 1 · Roll 3']);
  });

  it('carries scores into the next round and strikes a player through once the cut is shown', () => {
    const d = (a: number, b: number): Dice => [a, b] as Dice;
    const r1 = { players: ['p00001', 'p00002', 'p00003'], rolls: { p00001: [d(1, 1), d(1, 1), d(1, 1)], p00002: [d(2, 2), d(2, 2), d(2, 2)], p00003: [d(3, 3), d(3, 3), d(3, 3)] }, totals: { p00001: 6, p00002: 12, p00003: 18 }, advanced: ['p00003', 'p00002'], rollOffs: [] };
    const r2 = { players: ['p00003', 'p00002'], rolls: { p00003: [d(1, 1), d(1, 1), d(1, 1)], p00002: [d(2, 1), d(2, 1), d(2, 1)] }, totals: { p00003: 24, p00002: 21 }, advanced: ['p00003'], rollOffs: [] };
    const lines = contestLines({ winner: 'p00003', rounds: [r1, r2] }, id => id);
    const grid = (upTo: (l: (typeof lines)[number], i: number) => boolean) => {
      const { container, unmount } = render(<MemoryRouter><StaticLines lines={lines.filter(upTo)} /></MemoryRouter>);
      const tables = [...container.querySelectorAll('.roll-grid')];
      const last = tables[tables.length - 1];
      const out = [...last.querySelectorAll('tbody tr')].map(r => [r.textContent, r.classList.contains('out')] as const);
      unmount();
      return out;
    };
    const cut1 = lines.findIndex(l => l.text.startsWith('Advancing'));
    // Round 1 before the cut: nobody struck; after it, only p00001.
    const rolls1 = lines.map((l, i) => i).filter(i => lines[i].dice && lines[i].cell!.table === 'Round 1');
    expect(grid((l, i) => i <= rolls1[rolls1.length - 1]).every(([, o]) => !o)).toBe(true);
    expect(grid((l, i) => i <= cut1).map(([, o]) => o)).toEqual([true, false, false]);
    // Round 2 starts from round 1's totals and ends on its own.
    const all = grid(() => true);
    expect(all[0][0]).toContain('18');
    expect(all[1][0]).toContain('12');
    expect(all[0][0]).toContain('24');
    expect(all[1][0]).toContain('21');
    expect(all.map(([, o]) => o)).toEqual([false, true]);
  });

  it("puts each player's rolls for a round on one row, with a running total", () => {
    const d = (a: number, b: number): Dice => [a, b] as Dice;
    const result: ContestResult = {
      winner: 'p00002',
      rounds: [{ players: ['p00001', 'p00002'], rolls: { p00001: [d(1, 1), d(2, 2), d(3, 3)], p00002: [d(4, 4), d(5, 5), d(6, 6)] }, totals: { p00001: 12, p00002: 30 }, advanced: ['p00002'], rollOffs: [] }],
    };
    const lines = contestLines(result, id => id);
    const shown = lines.filter(l => l.dice).slice(0, 4); // both players' first two rolls
    const { container } = render(<MemoryRouter><StaticLines lines={shown} /></MemoryRouter>);
    const rows = [...container.querySelectorAll('.roll-grid tbody tr')].map(r => [...r.querySelectorAll('td')].map(c => c.textContent));
    expect(rows).toEqual([['p00001', '11 2', '22 4', '', '6'], ['p00002', '44 8', '55 10', '', '18']]);
  });

  it('names who rolls next before the roll, without showing the result', () => {
    const d = (a: number, b: number): Dice => [a, b] as Dice;
    const result: ContestResult = {
      winner: 'p00002',
      rounds: [{ players: ['p00001', 'p00002'], rolls: { p00001: [d(1, 1), d(2, 2), d(3, 3)], p00002: [d(4, 4), d(5, 5), d(6, 6)] }, totals: { p00001: 12, p00002: 30 }, advanced: ['p00002'], rollOffs: [] }],
    };
    const { container } = render(<MemoryRouter><DiceReveal lines={contestLines(result, id => `Name ${id}`)} onFinished={() => {}} busy={false} /></MemoryRouter>);
    const next = () => container.querySelector('.up-next')?.textContent ?? '';
    expect(next()).toBe('Up next · Round 1 · Roll 1 Name p00001');
    fireEvent.click(screen.getByRole('button', { name: 'Roll next' }));
    expect(next()).toBe('Up next · Round 1 · Roll 1 Name p00002');
    fireEvent.click(screen.getByRole('button', { name: 'Roll next' }));
    expect(next()).toBe('Up next · Round 1 · Roll 2 Name p00001');
    fireEvent.click(screen.getByRole('button', { name: 'Roll to end' }));
    expect(container.querySelector('.up-next')).toBeNull();
  });

  it('tumbles the newest roll before landing on it and showing its line', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    try {
      const lines = [{ group: 'G', text: 'first roll: 7', dice: [3, 4] as Dice }];
      render(<DiceReveal lines={lines} onFinished={() => {}} busy={false} />);
      fireEvent.click(screen.getByRole('button', { name: 'Roll next' }));
      expect(document.querySelectorAll('.dice.rolling')).toHaveLength(2);
      expect(screen.queryByText(/first roll: 7/)).toBeNull();
      act(() => { vi.advanceTimersByTime(1000); });
      expect(document.querySelectorAll('.dice.rolling')).toHaveLength(0);
      expect([...document.querySelectorAll('.dice')].map(e => e.textContent)).toEqual(['3', '4']);
      expect(screen.getByText(/first roll: 7/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
