// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tournamentChampion } from '../../engine/jc/tournaments';
import { jcStateFixture } from '../../engine/jc/testFixtures';
import type { JcState } from '../../engine/jc/state';
import { TournamentsPage } from './TournamentsPage';

function mount(s: JcState) {
  const p = `leagues/fbajc/S${s.season}`;
  const docs: Record<string, unknown> = {
    'calendar.json': s.calendar,
    'players.json': s.players,
    'leagues/fbajc/teams.json': s.teams,
    [`${p}/rosters.json`]: s.rosters,
  };
  if (s.schedule) docs[`${p}/schedule.json`] = s.schedule;
  if (s.results) docs[`${p}/results.json`] = s.results;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(<MemoryRouter><TournamentsPage /></MemoryRouter>);
}

/** Plays the first tournament in full: 12 games, home always wins. */
function playedFirst(): { s: JcState; champion: string } {
  const s = jcStateFixture();
  const f = s.schedule!.tournaments[0];
  const t = f.teams;
  const pairs: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [4, 6], [1, 3], [5, 7], [0, 4], [2, 6], [1, 5], [3, 7]];
  const games = pairs.map(([h, a], i) => ({ gameNo: 1000 + i, home: t[h], away: t[a], tournament: f.id }));
  s.schedule!.days[1].games = games;
  s.results!.games = games.map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away, homePts: 80, awayPts: 70 }));
  return { s, champion: tournamentChampion(f, games, s.results!.games)! };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('TournamentsPage', () => {
  it('shows 27 cards with 8 teams each before play', async () => {
    mount(jcStateFixture());
    await screen.findAllByRole('heading', { level: 2 });
    const cards = document.querySelectorAll('.jc-tournament');
    expect(cards.length).toBe(27);
    for (const c of cards) expect(c.querySelectorAll('ol.jc-seeds li').length).toBe(8);
    expect(document.querySelectorAll('.jc-tgame').length).toBe(0);
  });

  it('a played tournament shows 12 games and highlights the champion', async () => {
    const { s, champion } = playedFirst();
    mount(s);
    await screen.findAllByRole('heading', { level: 2 });
    const card = document.querySelectorAll('.jc-tournament')[0];
    expect(card.querySelectorAll('.jc-tgame').length).toBe(12);
    expect(card.querySelectorAll('.jc-champion').length).toBe(1);
    expect(card.querySelector('.jc-champion')!.textContent).toContain(champion);
  });
});
