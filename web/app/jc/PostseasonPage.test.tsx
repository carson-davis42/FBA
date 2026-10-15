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
import { markRevealed, setRevealCount } from './revealStore';

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

function mount(s: JcState, entry = '/league/fbajc/postseason', opts: { reveal?: boolean } = {}) {
  batches = [];
  if (opts.reveal !== false && s.postseason?.field) markRevealed(s);
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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

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

  it('reveals the field spot by spot, then shows the full field', async () => {
    const withField = setFields(afterConf);
    if (!withField.ok) throw new Error('x');
    mount(withField.state, '/league/fbajc/postseason?tab=field', { reveal: false });
    expect(await screen.findByRole('button', { name: 'Start the reveal' })).toBeTruthy();
    // An empty bracket: Region 1's Round of 64 has its eight games, every team a dash, and the swap controls are not there.
    fireEvent.click(screen.getByRole('button', { name: 'Region 1' }));
    const teams = () => [...document.querySelectorAll('.jc-tree .jc-bround')[0].querySelectorAll('.jc-bteam')].map(t => t.textContent);
    expect(teams()).toHaveLength(16);
    expect(teams().every(t => t === '—')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Swap' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start the reveal' }));
    // The first spot (the 1 seed of Region 1) is named; the rest are still open.
    expect(teams()[0]).toMatch(/[A-Z]/);
    expect(teams().slice(1).filter(t => t !== '—').length).toBe(0);
    // The other tabs wait for it.
    fireEvent.click(screen.getByRole('tab', { name: 'NIT' }));
    expect(screen.getByText('Reveal the field on the Field tab first.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Field' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip to the end' }));
    expect(await screen.findByRole('button', { name: 'Swap' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'First Four Out' })).toBeTruthy();
  });

  it('shows a play-in spot as both teams in the reveal bracket, like the real bracket', async () => {
    const withField = setFields(afterConf);
    if (!withField.ok) throw new Error('x');
    // All 64 spots revealed (the reveal is not finished: the bubble lists and the NIT are still to come).
    setRevealCount(withField.state, 64);
    const { container } = mount(withField.state, '/league/fbajc/postseason?tab=field', { reveal: false });
    await screen.findByRole('button', { name: 'Next spot' });
    let pairs = 0;
    for (const n of [1, 2, 3, 4]) {
      fireEvent.click(screen.getByRole('button', { name: `Region ${n}` }));
      const round = container.querySelectorAll('.jc-tree .jc-bround')[0];
      pairs += [...round.querySelectorAll('.jc-bteam')].filter(t => (t.textContent ?? '').includes('/')).length;
      expect([...round.querySelectorAll('.jc-bteam')].some(t => t.textContent === '—')).toBe(false);
    }
    expect(pairs).toBe(8);
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
    await screen.findByRole('heading', { name: 'March Madness field' });
    // The Field tab has the sections Bracketology has.
    for (const name of ['First Four In', 'Last Eight In', 'First Four Out', 'Seed lines', 'Bids by conference', 'NIT teams']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
    const cards = [1, 2, 3, 4].map(n => screen.getByRole('heading', { name: `Region ${n}` }).parentElement!);
    // A conference title guarantees the Round of 64, so all 18 champions hold a plain spot in a region and carry the marker.
    expect(cards.flatMap(c => [...c.querySelectorAll('li')]).filter(li => /\*/.test(li.textContent ?? '')).length).toBe(18);
    expect(screen.queryByText(/\(conference champion\)/)).toBeNull();
    // A play-in spot lists both teams, like the bracket.
    expect(cards.flatMap(c => [...c.querySelectorAll('li')]).filter(li => (li.textContent ?? '').includes('/')).length).toBe(8);
    expect(screen.getByRole('heading', { name: 'NIT teams' }).nextElementSibling!.querySelectorAll('li').length).toBe(32);
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
  it('shows the conference named in the URL, and falls back to the first for an unknown one', async () => {
    const ids = afterConf.postseason!.conf.map(b => b.id);
    const pick = ids[3];
    mount(afterConf, `/league/fbajc/postseason?tab=conference&conf=${pick}`);
    const select = (await screen.findByRole('combobox', { name: /Conference/ })) as HTMLSelectElement;
    expect(select.value).toBe(pick);
    cleanup();
    mount(afterConf, '/league/fbajc/postseason?tab=conference&conf=NOPE');
    const again = (await screen.findByRole('combobox', { name: /Conference/ })) as HTMLSelectElement;
    expect(again.value).toBe(ids[0]);
  });

  it('shows each team of the conference where it stood before the conference tournaments', async () => {
    const { container } = mount(afterConf, '/league/fbajc/postseason?tab=conference');
    const panel = (await screen.findByRole('heading', { name: 'Bracketology before the tournaments' })).parentElement!;
    const rows = [...panel.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(12);
    expect(rows.every(r => /Seed \d+|NIT|Out/.test(r.textContent ?? ''))).toBe(true);
    expect(panel.textContent).toContain('after day 29');
    expect(container.querySelector('.jc-conf-layout')).toBeTruthy();
  });

  it('lists the two play-in teams of a spot together in the projected regions', async () => {
    const { container } = mount(played, '/league/fbajc/postseason?tab=bracketology');
    await screen.findByRole('heading', { name: 'Projected bracket' });
    const cards = [1, 2, 3, 4].map(n => screen.getByRole('heading', { name: `Region ${n}` }).parentElement!);
    const slots = cards.flatMap(c => [...c.querySelectorAll('li')].filter(li => (li.textContent ?? '').includes('/')));
    expect(slots).toHaveLength(8);
    expect(cards.every(c => c.querySelectorAll('li').length === 16)).toBe(true);
    expect(container.textContent).toBeTruthy();
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
    expect(await screen.findByRole('heading', { name: 'March Madness field' })).toBeTruthy();
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
