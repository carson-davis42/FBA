// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collegeName } from '../../engine/college/state';
import { draftPath } from '../../engine/offseason/adjustAge';
import { proRatingsPath, startProRatings, type ProRatingsState } from '../../engine/offseason/proRatings';
import { proRatingsState } from '../../engine/offseason/testFixtures';
import { setRating, takeRest } from '../../engine/rank/ranking';
import type { RankingFile, RatingPauseFile, RostersFile, ScheduleFile, TeamsFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { ProRatingsPage } from './ProRatingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(
  <MemoryRouter initialEntries={['/league/fba/ratings']}>
    <Routes><Route path="/league/fba/ratings" element={<ProRatingsPage />} /></Routes>
  </MemoryRouter>,
);

const badge = { bg: '#123', fg: '#fff' };
const fbaTeams = (): TeamsFile => ({ league: 'fba', teams: [{ teamId: 'BOS', name: 'Boston', abbr: 'BOS', group: 'East', logoFolder: null, badge }] });

const started = (s: ProRatingsState = proRatingsState()): ProRatingsState => {
  const r = startProRatings(s);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return { ...s, ratings: r.writes[0].doc as RankingFile };
};
/** Everyone ranked in the app's order and rated. */
const complete = (): ProRatingsState => {
  const s = started();
  let doc = takeRest(s.ratings!, id => collegeName(s.players, id));
  doc.order.forEach((id, i) => { doc = setRating(doc, id, 90 - i * 5); });
  return { ...s, ratings: doc };
};

/** Every document the page loads. Missing ones are left out (404). */
function docsFor(s: ProRatingsState): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'meta.json': { currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 79, fbawc: 79 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 } },
    'players.json': s.players,
    'calendar.json': s.calendar,
    'leagues/fbajc/teams.json': s.collegeTeams,
    'leagues/fba/teams.json': fbaTeams(),
    'leagues/fba/S80/rosters.json': s.fba,
    'leagues/fba/S80/transactions.json': s.tx,
  };
  if (s.prevFba) out['leagues/fba/S79/rosters.json'] = s.prevFba as RostersFile;
  if (s.draft) out[draftPath(80)] = s.draft;
  if (s.ratings) out[proRatingsPath(80)] = s.ratings;
  if (s.prevRatings) out[proRatingsPath(79)] = s.prevRatings;
  return out;
}
const enabled = async (name: string) => {
  const b = await screen.findByRole('button', { name }) as HTMLButtonElement;
  await waitFor(() => expect(b.disabled).toBe(false));
  return b;
};

describe('ProRatingsPage', () => {
  it('starts the reset as one write that creates ratings.json', async () => {
    const log = stubApi(docsFor(proRatingsState()));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'S80 FBA ratings reset' })).toBeTruthy();
    fireEvent.click(await enabled('Start the pro ratings reset'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start the pro ratings reset');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fba/S80/ratings.json', null]]);
    expect((log.batches[0].writes[0].doc as RankingFile).kind).toBe('fba-reset');
  });

  it("falls back to last season's first ratings pause for the curve", async () => {
    const docs = docsFor(proRatingsState());
    const schedule: ScheduleFile = {
      league: 'fba', season: 79, locked: true, games: [],
      pauses: [{ afterGame: 10, kind: 'deadline', done: true }, { afterGame: 20, kind: 'ratings', done: true }],
    };
    const row = (playerId: string, oldRating: number) => ({
      playerId, teamId: 'BOS', position: 'PG' as const, oldRating, games: 5, ppg: 10, perf: null, suggested: null, rating: oldRating,
    });
    const pause: RatingPauseFile = { league: 'fba', season: 79, afterGame: 20, locked: true, players: [row('p00020', 88), row('p00024', 77)] };
    docs['leagues/fba/S79/schedule.json'] = schedule;
    docs['leagues/fba/S79/ratingPause-20.json'] = pause;
    const log = stubApi(docs);
    renderPage();
    fireEvent.click(await enabled('Start the pro ratings reset'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect((log.batches[0].writes[0].doc as RankingFile).curve).toEqual([88, 77]);
  });

  it('shows team names, Prospect for draft prospects and last season points', async () => {
    stubApi(docsFor(started()));
    renderPage();
    await screen.findByRole('button', { name: 'Rank Pro A next' });
    expect(screen.getAllByRole('button', { name: /^Rank .* next$/ }).map(b => b.textContent).sort()).toEqual(['Pro A', 'Pro E', 'Ron Three', 'Sam Senior']);
    expect(screen.getAllByText('Boston')).toHaveLength(2);
    expect(screen.getAllByText('Prospect')).toHaveLength(2);
    expect(screen.getByText('S79: 412 pts')).toBeTruthy();
    expect(screen.getByText(/College 80/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sync list' })).toBeNull();
  });

  it('autosaves a click with the loaded version', async () => {
    const log = stubApi(docsFor(started()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Rank Pro E next' }));
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0]).toMatchObject({ path: 'leagues/fba/S80/ratings.json', ifMatch: '"0000000000000001"' });
    expect((log.puts[0].doc as RankingFile).order).toEqual(['p00024']);
  });

  it('offers Sync list only while the pool differs from the list, and posts the sync', async () => {
    const s = started();
    const stale = { ...s.ratings!, rows: s.ratings!.rows.filter(r => r.playerId !== 'p00012') };
    const log = stubApi(docsFor({ ...s, ratings: stale }));
    renderPage();
    expect(await screen.findByText(/Ron Three isn't in the ratings list/)).toBeTruthy();
    fireEvent.click(await enabled('Sync list'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Sync the pro ratings list');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fba/S80/ratings.json', '0000000000000001']]);
    expect((log.batches[0].writes[0].doc as RankingFile).rows.map(r => r.playerId)).toContain('p00012');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sync list' })).toBeNull());
  });

  it('finishes as one batch that carries the loaded versions', async () => {
    const log = stubApi(docsFor(complete()));
    renderPage();
    fireEvent.click(await enabled('Finish ratings'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Finish the pro ratings reset');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
      'calendar.json', 'leagues/fba/S80/draft.json', 'leagues/fba/S80/ratings.json', 'leagues/fba/S80/rosters.json', 'leagues/fba/S80/transactions.json',
    ]);
    expect(log.batches[0].writes.every(w => w.baseVersion === '0000000000000001')).toBe(true);
  });

  it('hands off to the version an autosave returned when Finish follows an edit', async () => {
    const s = complete();
    const first = s.ratings!.order[0];
    const log = stubApi(docsFor({ ...s, ratings: setRating(s.ratings!, first, null) }));
    renderPage();
    const finish = await screen.findByRole('button', { name: 'Finish ratings' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
    const input = screen.getByLabelText(`New rating for ${collegeName(s.players, first)}`);
    fireEvent.change(input, { target: { value: '90' } });
    fireEvent.blur(input);
    await waitFor(() => expect(log.puts).toHaveLength(1));
    await waitFor(() => expect(finish.disabled).toBe(false));
    fireEvent.click(finish);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.find(w => w.path === 'leagues/fba/S80/ratings.json')!.baseVersion).toBe('0000000000000002');
  });

  it('is read-only once finished, with a way on to the draft board', async () => {
    const s = complete();
    stubApi(docsFor({ ...s, ratings: { ...s.ratings!, locked: true } }));
    renderPage();
    expect(await screen.findByText(/Pro ratings are finished\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Draft board ▸' }).getAttribute('href')).toBe('/league/fba/draft');
    expect(screen.queryByRole('button', { name: 'Finish ratings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sync list' })).toBeNull();
  });

  it('refuses to start before Adjust Age has made the draft board, and posts nothing', async () => {
    const log = stubApi(docsFor(proRatingsState({ draft: null })));
    renderPage();
    fireEvent.click(await enabled('Start the pro ratings reset'));
    expect(await screen.findByText('Run Adjust Age first')).toBeTruthy();
    expect(log.batches).toHaveLength(0);
  });
});
