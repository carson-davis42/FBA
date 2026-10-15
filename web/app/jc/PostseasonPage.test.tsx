// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { playAllConf, startConfTournaments } from '../../engine/jc/confTourney';
import { setFields } from '../../engine/jc/fieldMoves';
import { playPostToEnd } from '../../engine/jc/postseason';
import { jcPlayedFixture, jcReadyForNit } from '../../engine/jc/testFixtures';
import type { JcState } from '../../engine/jc/state';
import { PostseasonPage } from './PostseasonPage';
import { docsOf } from './postseasonTestDocs';

let batches: { writes: { path: string; baseVersion: string | null }[] }[] = [];
let played: JcState;
let afterConf: JcState;
let ready: JcState;
beforeAll(() => {
  played = jcPlayedFixture();
  const s = startConfTournaments(played);
  if (!s.ok) throw new Error(s.problems.join());
  const c = playAllConf(s.state, mulberry32(5));
  if (!c.ok) throw new Error(c.problems.join());
  afterConf = c.state;
  ready = jcReadyForNit();
}, 240000);

function mount(s: JcState, entry = '/league/fbajc/postseason') {
  batches = [];
  const docs = docsOf(s);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') {
      batches.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ batchId: 'b1', versions: {} }), { status: 200 });
    }
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(<MemoryRouter initialEntries={[entry]}><PostseasonPage /></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PostseasonPage', () => {
  it('starts the conference tournaments once the season is played', async () => {
    mount(played, '/league/fbajc/postseason?tab=conference');
    const start = await screen.findByRole('button', { name: 'Start conference tournaments' });
    expect(screen.getByText(/S79 FBAJC Postseason/)).toBeTruthy();
    fireEvent.click(start);
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes.map(w => w.path)).toEqual(['leagues/fbajc/S79/postseason.json']);
    expect(batches[0].writes[0].baseVersion).toBeNull();
  });

  it('shows a conference bracket with its regular-season champions', async () => {
    mount(afterConf, '/league/fbajc/postseason?tab=conference');
    expect(await screen.findByRole('group', { name: /bracket/i })).toBeTruthy();
    expect(screen.getByText(/Regular-season champion/)).toBeTruthy();
    expect(screen.getByText(/Tournament champion/)).toBeTruthy();
    expect(screen.getAllByText('Quarterfinals').length).toBeGreaterThan(0);
  });

  it('sets the fields, then lists March Madness regions and the NIT', async () => {
    mount(afterConf, '/league/fbajc/postseason?tab=field');
    fireEvent.click(await screen.findByRole('button', { name: 'Set the fields' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes[0].path).toBe('leagues/fbajc/S79/postseason.json');
    cleanup();
    const withField = setFields(afterConf);
    if (!withField.ok) throw new Error('x');
    mount(withField.state, '/league/fbajc/postseason?tab=field');
    expect(await screen.findByText('Region 4')).toBeTruthy();
    // Of the 18 champions, only those holding a plain spot in a region are listed with the marker: a champion who plays a
    // First Four game shows as 'Winner of P<n>', and one who is the challenger sits in no region.
    const post = withField.state.postseason!;
    const ff = post.field!.mm.firstFour;
    const listed = post.conf.map(b => b.champion!).filter(id => post.field!.mm.teams.includes(id) && !ff.some(g => g.teams[0] === id));
    expect(listed.length).toBeLessThan(18);
    expect(screen.getAllByText(/\(conf\. champion\)/).length).toBe(listed.length);
    expect(screen.getByRole('heading', { name: 'First Four' })).toBeTruthy();
    expect(screen.getAllByText(/^Winner of P\d$/).length).toBe(8);
    expect(screen.getAllByText(/^P\d: /).length).toBe(8);
    expect(document.querySelectorAll('h2 + .card ol li').length).toBe(32);
    expect(screen.getByRole('button', { name: 'Re-draw the fields' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Swap' })).toBeTruthy();
  });

  it('plays an NIT round: 16 first-round games, then a save of the postseason and rosters', async () => {
    mount(ready);
    await screen.findByText(/NIT is next/);
    const bracket = await screen.findByRole('group', { name: 'NIT bracket' });
    expect(within(bracket).getByText('Round of 32')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Region 1' }));
    expect(bracket.querySelectorAll('[data-game]').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Play round' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes.map(w => w.path).sort()).toEqual(['leagues/fbajc/S79/postseason.json', 'leagues/fbajc/S79/rosters.json']);
  });

  it('offers Watch for the next NIT game and box scores for played ones', async () => {
    mount(ready);
    const watch = await screen.findByRole('link', { name: 'Watch next game' });
    expect(watch.getAttribute('href')).toBe(`/league/fbajc/game/${ready.postseason!.nextGameNo}`);
    fireEvent.click(screen.getByRole('button', { name: 'Region 1' }));
    expect(screen.getAllByRole('link', { name: 'Watch' }).length).toBe(1);
    cleanup();
    mount(afterConf, '/league/fbajc/postseason?tab=conference');
    expect((await screen.findAllByRole('link', { name: 'Box score' })).length).toBeGreaterThan(0);
  });

  it('keeps March Madness locked until the NIT is won', async () => {
    mount(ready, '/league/fbajc/postseason?tab=mm');
    expect(await screen.findByText('Finish the NIT first')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Play round' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows the two play-in teams in a Round of 64 slot instead of TBD', async () => {
    const { container } = mount(played, '/league/fbajc/postseason?tab=bracketology');
    await screen.findByRole('heading', { name: 'First Four In' });
    const tabs = screen.getAllByRole('button').map(b => b.textContent);
    expect(tabs.indexOf('First Four')).toBeGreaterThanOrEqual(0);
    expect(tabs.indexOf('First Four')).toBeLessThan(tabs.indexOf('Region 1'));
    expect(container.querySelectorAll('.jc-tree [data-game^="P"]')).toHaveLength(8);
    let slots = 0;
    for (const n of [1, 2, 3, 4]) {
      fireEvent.click(screen.getByRole('button', { name: `Region ${n}` }));
      const sides = [...container.querySelectorAll('.jc-tree .jc-bteam')].map(t => t.textContent ?? '');
      slots += sides.filter(t => t.includes('/')).length;
      // Round of 64 has no TBD left: a play-in slot shows its two teams, separated by a slash.
      expect(container.querySelectorAll('.jc-tree .jc-bround')[0].textContent).not.toContain('TBD');
    }
    expect(slots).toBe(8);
  });

  it('shows Bracketology as the first tab and opens on it before the conference tournaments', async () => {
    mount(played);
    const tab = await screen.findByRole('tab', { name: 'Bracketology' });
    expect(tab.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'First Four In' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Last Eight In' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'First Four Out' })).toBeTruthy();
    for (const name of ['Power conferences, 1-4', 'Power conferences, 5-8', 'Other conferences, 1-4', 'Other conferences, 5-8']) {
      const box = screen.getByRole('heading', { name }).parentElement!;
      expect(box.querySelectorAll('li').length).toBe(4);
      expect(box.textContent).toMatch(/\(seed \d+\)/);
    }
    expect(screen.getAllByRole('heading', { name: 'Power conferences' })).toHaveLength(2);
    expect(screen.getAllByRole('heading', { name: 'Other conferences' })).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Watch' })).toBeNull();
  });

  it('keeps Bracketology reachable after the conference tournaments but hides it once the fields are set', async () => {
    mount(afterConf, '/league/fbajc/postseason?tab=bracketology');
    expect(await screen.findByRole('heading', { name: 'Last Eight In' })).toBeTruthy();
    cleanup();
    const set = setFields(afterConf);
    if (!set.ok) throw new Error(set.problems.join());
    mount(set.state, '/league/fbajc/postseason?tab=bracketology');
    await screen.findByRole('tab', { name: 'Field' });
    expect(screen.queryByRole('tab', { name: 'Bracketology' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Last Eight In' })).toBeNull();
  });

  it('March Madness shows a First Four list above the regions and plays it first', async () => {
    const nit = playPostToEnd(ready, 'nit', mulberry32(3));
    if (!nit.ok) throw new Error(nit.problems.join());
    mount(nit.state, '/league/fbajc/postseason?tab=mm');
    await screen.findByRole('button', { name: 'Region 1' });
    const [firstFour, bracket] = screen.getAllByRole('group', { name: 'March Madness bracket' });
    expect(screen.getByRole('heading', { name: 'First Four', level: 2 })).toBeTruthy();
    expect(firstFour.querySelectorAll('[data-game]').length).toBe(8);
    // Region 1 shows rounds 1-4 only: the First Four column is gone.
    fireEvent.click(screen.getByRole('button', { name: 'Region 1' }));
    expect(within(bracket).queryByText('First Four')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Final Four' }));
    expect(within(bracket).getByText('Final Four')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play round' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    const post = batches[0].writes.find(w => w.path.endsWith('postseason.json')) as unknown as { doc: { mm: { games: { round: number; result: unknown; home: string | null; away: string | null }[] } } };
    const games = post.doc.mm.games;
    expect(games.filter(g => g.round === 0).every(g => g.result)).toBe(true);
    expect(games.filter(g => g.round === 1).every(g => g.home && g.away)).toBe(true);
  });
});
