// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collegeRatingsPath, startCollegeRatings, type CollegeRatingsState } from '../../engine/college/collegeRatings';
import { boardPath, collegeName } from '../../engine/college/state';
import { collegeRatingsBaseState, collegeTeams } from '../../engine/college/testFixtures';
import { setRating, takeRest } from '../../engine/rank/ranking';
import type { RankingFile, RecruitingFile, RostersFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { CollegeRatingsPage } from './CollegeRatingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(
  <MemoryRouter initialEntries={['/league/fbajc/ratings']}>
    <Routes><Route path="/league/fbajc/ratings" element={<CollegeRatingsPage />} /></Routes>
  </MemoryRouter>,
);

const started = (s: CollegeRatingsState = collegeRatingsBaseState()): CollegeRatingsState => {
  const r = startCollegeRatings(s);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return { ...s, ratings: r.writes[0].doc as RankingFile };
};
/** Everyone ranked in last season's order (Moss 82, Reed 69, Vega 66) and rated in order. */
const complete = (): CollegeRatingsState => {
  const s = started();
  let doc = takeRest(s.ratings!, id => collegeName(s.players, id));
  doc = setRating(setRating(setRating(doc, 'p00485', 84), 'p00488', 70), 'p00503', 65);
  return { ...s, ratings: doc };
};

/** Every document the page loads (S79 rosters and calendar, the S78 board). Missing ones are left out (404). */
function docsFor(s: CollegeRatingsState): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    'players.json': s.players,
    'calendar.json': s.calendar,
    'leagues/fbajc/teams.json': collegeTeams(),
    'leagues/fbajc/S79/rosters.json': s.rosters,
    'leagues/fbajc/S79/transactions.json': s.tx,
    [boardPath(78)]: s.board,
  };
  if (s.prevRosters) out['leagues/fbajc/S78/rosters.json'] = s.prevRosters as RostersFile;
  if (s.ratings) out[collegeRatingsPath(79)] = s.ratings;
  return out;
}
const enabled = async (name: string) => {
  const b = await screen.findByRole('button', { name }) as HTMLButtonElement;
  await waitFor(() => expect(b.disabled).toBe(false));
  return b;
};

describe('CollegeRatingsPage', () => {
  it('says the rosters are missing before the college setup', async () => {
    const docs = docsFor(collegeRatingsBaseState());
    delete docs['leagues/fbajc/S79/rosters.json'];
    stubApi(docs);
    renderPage();
    expect(await screen.findByText(/college rosters don't exist yet/)).toBeTruthy();
  });

  it('starts the reset as one write that creates ratings.json', async () => {
    const log = stubApi(docsFor(collegeRatingsBaseState()));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'S79 college ratings reset' })).toBeTruthy();
    fireEvent.click(await enabled('Start ratings reset'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start college ratings reset');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fbajc/S79/ratings.json', null]]);
    expect((log.batches[0].writes[0].doc as RankingFile).kind).toBe('college-reset');
  });

  it('shows the school name, or Portal, and last season points', async () => {
    stubApi(docsFor(started()));
    renderPage();
    await screen.findByRole('button', { name: 'Rank Jaden Moss next' });
    expect(screen.getAllByRole('button', { name: /^Rank .* next$/ }).map(b => b.textContent)).toEqual(['Jaden Moss', 'Omar Reed', 'Luis Vega']);
    expect(screen.getByText('Portal')).toBeTruthy();
    expect(screen.getByText('Baylor')).toBeTruthy();
    expect(screen.getByText('Duke')).toBeTruthy();
    expect(screen.getAllByText('S78: 300 pts')).toHaveLength(3);
    expect(screen.queryByText('Zion Carter')).toBeNull();
  });

  it('autosaves a click with the loaded version', async () => {
    const log = stubApi(docsFor(started()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Rank Omar Reed next' }));
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0]).toMatchObject({ path: 'leagues/fbajc/S79/ratings.json', ifMatch: '"0000000000000001"' });
    expect((log.puts[0].doc as RankingFile).order).toEqual(['p00488']);
  });

  it('has no Consensus column', async () => {
    stubApi(docsFor(complete()));
    renderPage();
    await screen.findByLabelText('New rating for Jaden Moss');
    expect(screen.queryByText('Consensus')).toBeNull();
  });

  it('finishes as one batch of five documents', async () => {
    const log = stubApi(docsFor(complete()));
    renderPage();
    fireEvent.click(await enabled('Finish ratings'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Finish college ratings');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
      'calendar.json', 'leagues/fbajc/S78/recruiting.json', 'leagues/fbajc/S79/ratings.json', 'leagues/fbajc/S79/rosters.json',
      'leagues/fbajc/S79/transactions.json',
    ]);
    expect(log.batches[0].writes.every(w => w.baseVersion === '0000000000000001')).toBe(true);
    const board = log.batches[0].writes.find(w => w.path === 'leagues/fbajc/S78/recruiting.json')!.doc as RecruitingFile;
    expect(board.portal.map(p => p.rating)).toEqual([65, 70]);
  });

  it('hands off to the version an autosave returned when Finish follows an edit', async () => {
    const s = complete();
    const log = stubApi(docsFor({ ...s, ratings: setRating(s.ratings!, 'p00503', null) }));
    renderPage();
    const finish = await screen.findByRole('button', { name: 'Finish ratings' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
    const input = screen.getByLabelText('New rating for Luis Vega');
    fireEvent.change(input, { target: { value: '65' } });
    fireEvent.blur(input);
    await waitFor(() => expect(log.puts).toHaveLength(1));
    await waitFor(() => expect(finish.disabled).toBe(false));
    fireEvent.click(finish);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.find(w => w.path === 'leagues/fbajc/S79/ratings.json')!.baseVersion).toBe('0000000000000002');
  });

  it('refuses to finish off-step, with the calendar problem, and posts nothing', async () => {
    const s = complete();
    const calendar = { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 'rank-s80-class' ? { ...x, done: false } : x)) };
    const log = stubApi(docsFor({ ...s, calendar }));
    renderPage();
    fireEvent.click(await enabled('Finish ratings'));
    expect(await screen.findByText('College ratings are adjusted at the Adjust College Ratings step (current step: Rank S80 Class)')).toBeTruthy();
    expect(log.batches).toHaveLength(0);
  });

  it('is read-only once finished', async () => {
    const s = complete();
    stubApi(docsFor({ ...s, ratings: { ...s.ratings!, locked: true } }));
    renderPage();
    expect(await screen.findByText(/College ratings are finished/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finish ratings' })).toBeNull();
  });

  it('keeps last season rosters optional', async () => {
    const s = collegeRatingsBaseState();
    const docs = docsFor({ ...s, prevRosters: null });
    stubApi(docs);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Start ratings reset' })).toBeTruthy();
  });
});
