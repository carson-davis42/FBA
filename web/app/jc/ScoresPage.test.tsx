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
  if (s.board) docs[`leagues/fbajc/S${s.season - 1}/recruiting.json`] = s.board;
  if (s.schedule) docs[`${p}/schedule.json`] = s.schedule;
  if (s.results) docs[`${p}/results.json`] = s.results;
  if (s.rankings) docs[`${p}/rankings.json`] = s.rankings;
  return docs;
}

function mount(s: JcState, drop: string[] = []) {
  batches = [];
  const docs = docsOf(s);
  for (const d of drop) delete docs[d];
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

  it('a missing season rosters doc shows a message, not Loading and not the season title', async () => {
    mount(jcUnstartedFixture(), ['leagues/fbajc/S79/rosters.json']);
    expect(await screen.findByText(/S79 college rosters don't exist yet/)).toBeTruthy();
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.queryByText(/S79 FBAJC/)).toBeNull();
  });

  it('Start season is disabled while recruits are uncommitted', async () => {
    const s = jcUnstartedFixture();
    s.board = { league: 'fbajc', season: 78, classOf: 79, locked: false, classDraft: [], created: true, recruits: [{ playerId: 'p99999', position: 'PG', classYear: 'Fr', rating: null, stars: null, projections: {}, committedTo: null }], portal: [] };
    mount(s);
    expect((await screen.findByRole('button', { name: 'Start season' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/haven't committed yet/)).toBeTruthy();
  });

  it('offers Watch next game for game 1, a Watch link on it, and box-score links on played scores', async () => {
    mount(jcStateFixture());
    const watch = await screen.findByRole('link', { name: 'Watch next game' });
    expect(watch.getAttribute('href')).toBe('/league/fbajc/game/1');
    expect(screen.getAllByRole('link', { name: 'Watch' }).length).toBe(1);
    expect(screen.getByRole('link', { name: 'Watch' }).getAttribute('href')).toBe('/league/fbajc/game/1');
  });

  it('a started season at day 0 shows the 27 fields and a re-draw button', async () => {
    mount(jcStateFixture());
    expect(await screen.findByRole('button', { name: 'Re-draw tournament fields' })).toBeTruthy();
    expect(document.querySelectorAll('.jc-field').length).toBe(27);
  });

  it('shows 108 game cards for day 1, like the other leagues: a day strip, status, records and box-score links', async () => {
    mount(jcStateFixture());
    await screen.findByText(/Day 1 of 29/);
    expect(screen.getByText(/Preseason tournament/)).toBeTruthy();
    expect(document.querySelectorAll('.game-card').length).toBe(108);
    expect(screen.getAllByText(/^Game \d+ · (Next|Upcoming)$/).length).toBe(108);
    expect(screen.getByRole('group', { name: 'Game days' }).querySelectorAll('button').length).toBe(29);
    fireEvent.click(screen.getByRole('button', { name: 'Go to day 2' }));
    expect(screen.getByText(/Day 2 of 29/)).toBeTruthy();
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

  it('shows the poll rank before each ranked team on the game cards', async () => {
    const s = jcStateFixture();
    s.rankings = { league: 'fbajc', season: s.season, locked: false, snapshots: [{ afterDay: 1, order: s.teams.teams.map(t => t.teamId) }] };
    mount(s);
    await screen.findByText(/Day 1 of 29/);
    const ranks = [...document.querySelectorAll('.game-card .team-rank')].map(e => Number(e.textContent));
    expect(ranks.length).toBeGreaterThan(0);
    expect(Math.max(...ranks)).toBeLessThanOrEqual(25);
  });
  it('shows every tournament on a tournament day, each with a link to watch its own next game', async () => {
    const s = jcStateFixture();
    mount(s);
    await screen.findByText(/Day 1 of 29/);
    expect(document.querySelectorAll('.jc-tournament').length).toBe(27);
    const f = s.schedule!.tournaments[10];
    const first = s.schedule!.days[0].games.find(g => g.tournament === f.id)!;
    const link = screen.getByRole('link', { name: `Watch next game in ${f.name}` });
    expect(link.getAttribute('href')).toBe(`/league/fbajc/game/${first.gameNo}`);
  });

  it('keeps showing the brackets, with scores and box-score links, once games are played', async () => {
    const s = jcStateFixture();
    const f = s.schedule!.tournaments[0];
    const games = s.schedule!.days[0].games.filter(g => g.tournament === f.id);
    s.results!.games = games.map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away, homePts: 80, awayPts: 70 }));
    mount(s);
    await screen.findByText(/Day 1 of 29/);
    const card = [...document.querySelectorAll('.jc-tournament')][0] as HTMLElement;
    expect(card.querySelectorAll('.jc-tgame').length).toBe(4);
    expect(card.querySelectorAll('a[title="Box score"]').length).toBe(4);
    expect(card.textContent).toContain('70–80');
  });
});
