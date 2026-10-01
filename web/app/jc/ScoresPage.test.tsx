// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jcStateFixture, jcUnstartedFixture } from '../../engine/jc/testFixtures';
import type { JcState } from '../../engine/jc/state';
import { ScoresPage } from './ScoresPage';

let batches: { writes: { path: string; baseVersion: string | null }[] }[] = [];

function docsOf(s: JcState): Record<string, unknown> {
  const p = `leagues/fbajc/S${s.season}`;
  const docs: Record<string, unknown> = {
    'calendar.json': s.calendar,
    'players.json': s.players,
    'leagues/fbajc/teams.json': s.teams,
    [`${p}/rosters.json`]: s.rosters,
  };
  if (s.schedule) docs[`${p}/schedule.json`] = s.schedule;
  if (s.results) docs[`${p}/results.json`] = s.results;
  if (s.rankings) docs[`${p}/rankings.json`] = s.rankings;
  return docs;
}

function mount(s: JcState) {
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
  return render(<MemoryRouter><ScoresPage /></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ScoresPage', () => {
  it('start panel: open spots show the walk-on message and a disabled Start button', async () => {
    const s = jcUnstartedFixture();
    s.rosters.teams['C00T00'][0] = { ...s.rosters.teams['C00T00'][0], playerId: null, rating: null };
    mount(s);
    expect((await screen.findAllByText(/walk-ons/i)).length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Start season' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('link', { name: /recruiting/i }).getAttribute('href')).toBe('/league/fbajc/recruiting');
    expect(screen.getByText(/S79 FBAJC/)).toBeTruthy();
  });

  it('a started season at day 0 shows the 27 fields and a re-draw button', async () => {
    mount(jcStateFixture());
    expect(await screen.findByRole('button', { name: 'Re-draw tournament fields' })).toBeTruthy();
    expect(document.querySelectorAll('.jc-field').length).toBe(27);
  });

  it('shows 108 games for day 1 and the day label', async () => {
    mount(jcStateFixture());
    await screen.findByText(/Day 1 of 29/);
    expect(screen.getByText(/Preseason tournament/)).toBeTruthy();
    expect(document.querySelectorAll('.jc-game').length).toBe(108);
  });

  it('Play day saves once even when double-clicked', async () => {
    mount(jcStateFixture());
    const btn = await screen.findByRole('button', { name: 'Play day' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(batches.length).toBeGreaterThan(0));
    await new Promise(r => setTimeout(r, 50));
    expect(batches.length).toBe(1);
  });

  it('names-needed card lists a qualifying unnamed player', async () => {
    const s = jcStateFixture();
    const e = s.rosters.teams['C00T00'].find(x => x.classYear === 'Jr')!;
    e.rating = 90;
    s.players.players[e.playerId!] = { ...s.players.players[e.playerId!], name: null };
    mount(s);
    expect(await screen.findByText('Names needed')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /C00T00/ }).length).toBeGreaterThan(0);
  });
});
