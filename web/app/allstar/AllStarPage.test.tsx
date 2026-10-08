// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asgAvailable, asgPick } from '../../engine/allstar/asgDraft';
import { fbaPlayers } from '../../engine/allstar/common';
import { POSITIONS } from '../../engine/roster/rules';
import { suggestSelections } from '../../engine/allstar/selection';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { AllStarPage } from './AllStarPage';
import { allStarSeasonState } from './testState';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const renderPage = () => render(<MemoryRouter><AllStarPage /></MemoryRouter>);

describe('AllStarPage', () => {
  it('waits for the All-Star pause', async () => {
    stubApi(seasonDocs(fbaSeasonState()));
    renderPage();
    expect(await screen.findByText(/happens at the ¾ pause/)).toBeTruthy();
  });

  /** Four players who aren't Young-Stars, with a Hall of Fame class of the first two and past champion captains the other two. */
  function captainDocs() {
    const s = allStarSeasonState('none');
    const list = fbaPlayers(s.rosters, s.players);
    const young = new Set(suggestSelections(list, new Map()).youngStars);
    const [a, b, c, d, e] = list.filter(p => !young.has(p.playerId)).slice(0, 5);
    const docs = {
      ...seasonDocs(s),
      'leagues/fba/hallOfFame.json': { league: 'fba', classes: [{ season: 'S77', inductees: [] }, { season: 'S78', inductees: [a, b].map(p => ({ name: p.name, playerId: p.playerId, retiredSeason: 'S70', lines: [] })) }], nominees: [], removed: [] },
    };
    const seasons = [
      { league: 'fba', season: 60, locked: true, host: null, champions: [], allStar: { allStars: [], youngStars: [], asgMvp: null, fivePoint: null, dunk: null, ysgWinner: `Team ${d.name}` } },
      { league: 'fba', season: 70, locked: true, host: null, champions: [], allStar: { allStars: [], youngStars: [], asgMvp: null, fivePoint: null, dunk: null, ysgWinner: `Team ${c.name}` } },
    ];
    return { s, docs, seasons, people: { a, b, c, d, e } };
  }
  const stubHistory = (seasons: unknown[]) => {
    const inner = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) =>
      (url === '/api/history/fba' ? new Response(JSON.stringify({ seasons, errors: [] })) : inner(url, init))));
  };

  it('fills the Young-Star captains with the latest Hall of Fame class, then past champion captains, and saves them', async () => {
    const { docs, seasons, people } = captainDocs();
    const log = stubApi(docs);
    stubHistory(seasons);
    renderPage();
    const save = await screen.findByRole('button', { name: 'Save selections' });
    const value = (i: number) => (screen.getByLabelText(`Young-Star captain ${i}`) as HTMLInputElement).value;
    const label = (p: { name: string; playerId: string }) => `${p.name} (${p.playerId})`;
    expect([1, 2].map(value)).toEqual([people.a, people.b].map(label));
    expect([3, 4].map(value).sort()).toEqual([people.c, people.d].map(label).sort());
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Save All-Star selections');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fba/S79/allstar.json', null]]);
  });

  it('cycles the open captain spots and lands on past champion captains, leaving the Hall of Fame class alone', async () => {
    const { docs, seasons, people } = captainDocs();
    stubApi(docs);
    stubHistory(seasons);
    renderPage();
    const button = await screen.findByRole('button', { name: 'Draw champion captains' });
    const value = (i: number) => (screen.getByLabelText(`Young-Star captain ${i}`) as HTMLInputElement).value;
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    try {
      fireEvent.click(button);
      expect(screen.getByRole('button', { name: 'Drawing…' })).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Save selections' }) as HTMLButtonElement).disabled).toBe(true);
      act(() => { vi.advanceTimersByTime(3000); });
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByRole('button', { name: 'Draw champion captains' })).toBeTruthy();
    const label = (p: { name: string; playerId: string }) => `${p.name} (${p.playerId})`;
    expect([1, 2].map(value)).toEqual([people.a, people.b].map(label));
    expect([3, 4].map(value).sort()).toEqual([people.c, people.d].map(label).sort());
  });

  it('refuses a Young-Star captain who is neither in the Hall of Fame class nor a past champion captain', async () => {
    const { docs, seasons, people } = captainDocs();
    stubApi(docs);
    stubHistory(seasons);
    renderPage();
    const save = await screen.findByRole('button', { name: 'Save selections' });
    fireEvent.change(screen.getByLabelText('Young-Star captain 4'), { target: { value: `${people.e.name} (${people.e.playerId})` } });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText(/must be the latest Hall of Fame class or former Young-Star champion captains/)).toBeTruthy();
  });

  it('flips for the first pick, then drafts', async () => {
    const log = stubApi(seasonDocs(allStarSeasonState('selected')));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Coin flip' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start All-Star draft (coin flip)');
    cleanup();
    const log2 = stubApi(seasonDocs(allStarSeasonState('drafting')));
    renderPage();
    const board = await screen.findByRole('table', { name: 'Available All-Stars' });
    fireEvent.click(within(board).getAllByRole('row')[1]);
    fireEvent.click(screen.getByRole('button', { name: /^Pick / }));
    await waitFor(() => expect(log2.batches).toHaveLength(1));
    expect(log2.batches[0].label).toBe('All-Star draft pick 1');
  });

  it('lists each draft team by position, then in the order picked', async () => {
    const s = allStarSeasonState('drafting');
    const list = fbaPlayers(s.rosters, s.players);
    for (let k = 0; k < 8; k++) {
      const r = asgPick(s.allstar!, asgAvailable(s.allstar!, list)[0].playerId, list);
      if (!r.ok) throw new Error(r.problems.join('; '));
      s.allstar = r.doc;
    }
    stubApi(seasonDocs(s));
    renderPage();
    await screen.findByRole('table', { name: 'Available All-Stars' });
    for (const team of document.querySelectorAll('.asg-team')) {
      const rows = [...team.querySelectorAll('tbody tr')].map(r => [...r.querySelectorAll('td')].map(c => c.textContent ?? ''));
      expect(rows.length).toBeGreaterThan(1);
      const key = (r: string[]) => [POSITIONS.indexOf(r[2] as never), r[0] === 'C' ? 0 : Number(r[0])];
      for (let i = 1; i < rows.length; i++) {
        const [pa, ka] = key(rows[i - 1]);
        const [pb, kb] = key(rows[i]);
        expect(pa < pb || (pa === pb && ka < kb)).toBe(true);
      }
    }
  });

  it('runs the contest draw turn by turn', async () => {
    const log = stubApi(seasonDocs(allStarSeasonState('drawing')));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Pass' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toMatch(/^Contest draw: T\d+ passes$/);
  });
});
