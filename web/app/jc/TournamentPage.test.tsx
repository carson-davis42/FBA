// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tournamentChampion } from '../../engine/jc/tournaments';
import { jcStateFixture } from '../../engine/jc/testFixtures';
import type { JcState } from '../../engine/jc/state';
import { TournamentPage } from './TournamentPage';

function mount(s: JcState, id: string) {
  const p = `leagues/fbajc/S${s.season}`;
  const docs: Record<string, unknown> = {
    'calendar.json': s.calendar, 'players.json': s.players, 'leagues/fbajc/teams.json': s.teams, [`${p}/rosters.json`]: s.rosters,
  };
  if (s.schedule) docs[`${p}/schedule.json`] = s.schedule;
  if (s.results) docs[`${p}/results.json`] = s.results;
  if (s.rankings) docs[`${p}/rankings.json`] = s.rankings;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(
    <MemoryRouter initialEntries={[`/league/fbajc/tournaments/${id}`]}>
      <Routes><Route path="/league/fbajc/tournaments/:id" element={<TournamentPage />} /></Routes>
    </MemoryRouter>,
  );
}

function played(): { s: JcState; id: string; champion: string } {
  const s = jcStateFixture();
  const f = s.schedule!.tournaments[0];
  const t = f.teams;
  const pairs: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [4, 6], [1, 3], [5, 7], [0, 4], [2, 6], [1, 5], [3, 7]];
  const games = pairs.map(([h, a], i) => ({ gameNo: 1000 + i, home: t[h], away: t[a], tournament: f.id }));
  // The fixture already schedules this field's games (unplayed): replace them with the twelve played ones.
  for (const d of s.schedule!.days) d.games = d.games.filter(g => g.tournament !== f.id);
  s.schedule!.days[1].games.push(...games);
  s.results!.games = games.map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away, homePts: 80, awayPts: 70 }));
  return { s, id: f.id, champion: tournamentChampion(f, games, s.results!.games)! };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('TournamentPage', () => {
  it('shows the three rounds with every game, a box score link on each played game, and the final table', async () => {
    const { s, id } = played();
    mount(s, id);
    const bracket = await screen.findByLabelText(/bracket$/);
    expect(within(bracket).getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Round 1', 'Round 2', 'Placement']);
    expect(bracket.querySelectorAll('.game-card').length).toBe(12);
    const links = within(bracket).getAllByRole('link', { name: 'Box score' });
    expect(links).toHaveLength(12);
    expect(links[0].getAttribute('href')).toBe('/league/fbajc/game/1000');
    expect(screen.getByRole('heading', { name: 'Final table' })).toBeTruthy();
    expect(screen.getByText('Champion:')).toBeTruthy();
  });

  it('shows the field of eight before any game is played', async () => {
    const s = jcStateFixture();
    mount(s, s.schedule!.tournaments[0].id);
    expect(await screen.findByRole('heading', { name: 'Field' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Final table' })).toBeNull();
  });

  it('says so for a tournament that does not exist', async () => {
    mount(jcStateFixture(), 'nope');
    expect(await screen.findByText('No such tournament.')).toBeTruthy();
  });
});
