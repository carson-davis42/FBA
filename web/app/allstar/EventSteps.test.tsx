// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import type { TeamGame } from '../../engine/shared/types';
import { AllStarPage } from './AllStarPage';
import { StaticLines } from './DiceReveal';
import { gameResultText, ysgLines } from './EventSteps';
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
    expect(await screen.findByText(/^Winner: /)).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Roll to end' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Play the All-Star Game');
    cleanup();
    const log2 = open('complete');
    fireEvent.click(await screen.findByRole('button', { name: 'Finish All-Star weekend' }));
    await waitFor(() => expect(log2.batches).toHaveLength(1));
    expect(log2.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/allstar.json', 'leagues/fba/S79/schedule.json']);
  });

  it('reads the Young-Star finals and champions without repeated prefixes (B6)', () => {
    const doc = allStarSeasonState('complete').allstar!;
    const { container } = render(<StaticLines lines={ysgLines(doc, id => id)} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/final · Final:/);
    expect(text).not.toContain('Champions · ');
    expect(text.match(/Final: /g)).toHaveLength(3);
    expect(text).toContain('Champions: Team ');
  });

  it('shows the Young-Star MVP in the step lines and the weekend results', async () => {
    const doc = allStarSeasonState('complete').allstar!;
    expect(doc.ysg!.mvp).toBeTruthy();
    const { container } = render(<StaticLines lines={ysgLines(doc, id => `N-${id}`)} />);
    expect(container.textContent).toContain(`YSG MVP: N-${doc.ysg!.mvp}`);
    cleanup();
    open('complete');
    const results = await screen.findByText(/Young-Star champions: Team /);
    expect(results.textContent).toMatch(/ \u00b7 MVP \S/);
  });

  it('shows no MVP text for a Young-Star doc without an MVP', () => {
    const doc = allStarSeasonState('complete').allstar!;
    const { mvp: _m, mvpRollOff: _r, ...ysg } = doc.ysg!;
    const { container } = render(<StaticLines lines={ysgLines({ ...doc, ysg }, id => id)} />);
    expect(container.textContent).not.toContain('MVP');
  });

  it('says when a roll-off decided a game (B7)', () => {
    const game: TeamGame = { teams: [0, 1], rolls: [], scores: [144, 144], rollOff: { ids: ['0', '1'], rounds: [] }, winner: 1 };
    expect(gameResultText(game, t => `Team ${t + 1}`)).toBe('Team 2 144–144, won the roll-off');
    expect(gameResultText({ ...game, scores: [150, 140], rollOff: null, winner: 0 }, t => `Team ${t + 1}`)).toBe('Team 1 150–140');
  });
});
