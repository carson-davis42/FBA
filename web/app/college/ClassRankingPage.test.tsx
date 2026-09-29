// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classRankingPath, setConsensus, startClassRanking, type ClassRankState } from '../../engine/college/classRanking';
import { boardPath, collegeName } from '../../engine/college/state';
import { collegeClassState } from '../../engine/college/testFixtures';
import { setRating, takeRest } from '../../engine/rank/ranking';
import type { CalendarFile, RankingFile, RecruitingFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { ClassRankingPage } from './ClassRankingPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(
  <MemoryRouter initialEntries={['/league/fbajc/class-ranking']}>
    <Routes><Route path="/league/fbajc/class-ranking" element={<ClassRankingPage />} /></Routes>
  </MemoryRouter>,
);

const idOf = (i: number) => `p${String(2000 + i).padStart(5, '0')}`;
const nameOf = (i: number) => `Kid ${String(i + 1).padStart(2, '0')}`;
/** The ranking step is current when the class was created; otherwise Create S80 Class still is. */
const CALENDAR = (rankCurrent: boolean): CalendarFile => ({
  season: 79,
  steps: [
    { id: 'create-s80-class', label: 'Create S80 Class', kind: 'offseason', league: null, sub: false, done: rankCurrent },
    { id: 'rank-s80-class', label: 'Rank S80 Class', kind: 'offseason', league: null, sub: false, done: false },
    { id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: false },
  ],
});

/** An S80 class of 30 recruits (board S79), the ranking not started, Rank S80 Class current. */
function classState(rankCurrent = true): ClassRankState {
  const base = collegeClassState();
  const players = { ...base.players, players: { ...base.players.players } };
  const recruits = Array.from({ length: 30 }, (_, i) => {
    players.players[idOf(i)] = { id: idOf(i), name: nameOf(i), birthSeason: 62 };
    return { playerId: idOf(i), position: (['PG', 'SG', 'SF', 'PF', 'C'] as const)[i % 5], classYear: 'Fr' as const, rating: null, stars: null, projections: {}, committedTo: null };
  });
  return { board: { ...base.recruiting, recruits }, ranking: null, prevRanking: null, players, tx: base.tx, season: 79, calendar: CALENDAR(rankCurrent) };
}
const started = (prev: RankingFile | null = null, rankCurrent = true): ClassRankState => {
  const s = { ...classState(rankCurrent), prevRanking: prev };
  const r = startClassRanking(s);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return { ...s, ranking: r.writes[0].doc as RankingFile };
};
/** 12 5-star (99 down to 93.5), 14 4-star, 4 3-star. */
const CONSENSUS = [
  ...Array.from({ length: 12 }, (_, i) => 99 - 0.5 * i),
  ...Array.from({ length: 14 }, (_, i) => 89 - 0.5 * i),
  ...Array.from({ length: 4 }, (_, i) => 78 - i),
];
/** Everyone ranked in id order, rated 98 down, with the consensus above: ready to finish. */
const filled = (rankCurrent = true): ClassRankState => {
  const s = started(null, rankCurrent);
  let doc = takeRest(s.ranking!, id => collegeName(s.players, id));
  for (let i = 0; i < 30; i++) doc = setConsensus(setRating(doc, idOf(i), 98 - i), idOf(i), CONSENSUS[i]);
  return { ...s, ranking: doc };
};
const prevClass = (): RankingFile => {
  const ids = Array.from({ length: 30 }, (_, i) => `p0${1000 + i}`);
  return {
    league: 'fbajc', season: 78, kind: 'college-class', locked: true,
    rows: ids.map(playerId => ({ playerId, position: 'PG' as const, age: null, team: null, prevRating: null, otherRating: null, stat: null })),
    order: ids, ratings: Object.fromEntries(ids.map((id, i) => [id, 97 - i])), curve: [],
    consensus: Object.fromEntries(ids.map((id, i) => [id, CONSENSUS[i]])), consensusCurve: [],
  };
};

/** Every document the page loads. Missing ones are left out (404). */
function docsFor(s: ClassRankState, board: RecruitingFile = s.board): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    'players.json': s.players,
    'calendar.json': s.calendar,
    'leagues/fbajc/S79/transactions.json': s.tx,
    [boardPath(79)]: board,
  };
  if (s.ranking) out[classRankingPath(79)] = s.ranking;
  if (s.prevRanking) out[classRankingPath(78)] = s.prevRanking;
  return out;
}
const enabled = async (name: string) => {
  const b = await screen.findByRole('button', { name }) as HTMLButtonElement;
  await waitFor(() => expect(b.disabled).toBe(false));
  return b;
};

describe('ClassRankingPage', () => {
  it('says the class must be created first when the next board has no class yet', async () => {
    const s = classState();
    stubApi(docsFor(s, { ...s.board, created: false, recruits: [] }));
    renderPage();
    expect(await screen.findByText(/hasn't been created yet/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Rank S80 Class' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start ranking' })).toBeNull();
  });

  it('treats a missing next-class board as not created', async () => {
    const s = classState();
    const docs = docsFor(s);
    delete docs[boardPath(79)];
    stubApi(docs);
    renderPage();
    expect(await screen.findByText(/hasn't been created yet/)).toBeTruthy();
    expect(screen.queryByText(/Couldn't load/)).toBeNull();
  });

  it('labels the unranked list "Unranked"', async () => {
    stubApi(docsFor(started()));
    renderPage();
    expect(await screen.findByRole('table', { name: 'Unranked' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: "Last season's order" })).toBeNull();
  });

  it('starts the ranking as one write that creates the class ranking', async () => {
    const log = stubApi(docsFor(classState()));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Rank S80 Class' })).toBeTruthy();
    fireEvent.click(await enabled('Start ranking'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start S80 class ranking');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fbajc/S79/classRanking.json', null]]);
    const doc = log.batches[0].writes[0].doc as RankingFile;
    expect(doc.kind).toBe('college-class');
    expect(doc.consensusCurve).toEqual([]);
  });

  it('builds the suggestion curves from the previous class ranking at S78', async () => {
    const log = stubApi(docsFor({ ...classState(), prevRanking: prevClass() }));
    renderPage();
    fireEvent.click(await enabled('Start ranking'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    const doc = log.batches[0].writes[0].doc as RankingFile;
    expect(doc.consensusCurve).toEqual(CONSENSUS);
    expect(doc.curve[0]).toBe(97);
  });

  it('shows the Consensus column, stars and suggested chips once everyone is ranked', async () => {
    stubApi(docsFor(started(prevClass())));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Take the rest in order' }));
    await screen.findByLabelText('Consensus for Kid 01');
    const headers = within(screen.getByRole('table', { name: 'New ranking' })).getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toContain('Consensus');
    expect(screen.getByRole('button', { name: 'Use suggested consensus 99 for Kid 01' }).textContent).toBe('suggested 99');
  });

  it('autosaves a typed consensus with the loaded version and shows its stars', async () => {
    const log = stubApi(docsFor(filled()));
    renderPage();
    expect(screen.queryAllByLabelText('3 stars')).toHaveLength(0);
    const box = await screen.findByLabelText('Consensus for Kid 30');
    expect(screen.getAllByLabelText('3 stars')).toHaveLength(4);
    fireEvent.change(box, { target: { value: '70.5' } });
    fireEvent.blur(box);
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0]).toMatchObject({ path: 'leagues/fbajc/S79/classRanking.json', ifMatch: '"0000000000000001"' });
    expect((log.puts[0].doc as RankingFile).consensus![idOf(29)]).toBe(70.5);
  });

  it('lists the blockers once, and keeps Finish disabled', async () => {
    stubApi(docsFor(started()));
    renderPage();
    expect(await screen.findAllByText("30 players aren't ranked yet")).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Finish ranking' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists a consensus blocker and keeps Finish disabled', async () => {
    const s = filled();
    stubApi(docsFor({ ...s, ranking: setConsensus(s.ranking!, idOf(0), null) }));
    renderPage();
    expect(await screen.findByText('1 player still needs a consensus')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Finish ranking' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('finishes as one batch of four documents', async () => {
    const log = stubApi(docsFor(filled()));
    renderPage();
    fireEvent.click(await enabled('Finish ranking'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Finish S80 class ranking');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
      'calendar.json', 'leagues/fbajc/S79/classRanking.json', 'leagues/fbajc/S79/recruiting.json', 'leagues/fbajc/S79/transactions.json',
    ]);
    expect(log.batches[0].writes.every(w => w.baseVersion === '0000000000000001')).toBe(true);
    const board = log.batches[0].writes.find(w => w.path === 'leagues/fbajc/S79/recruiting.json')!.doc as RecruitingFile;
    expect(board.recruits[0]).toMatchObject({ rating: 98, consensus: 99, stars: 5 });
  });

  it('hands off to the version an autosave returned when Finish follows an edit', async () => {
    const s = filled();
    const log = stubApi(docsFor({ ...s, ranking: setConsensus(s.ranking!, idOf(29), null) }));
    renderPage();
    const finish = await screen.findByRole('button', { name: 'Finish ranking' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
    const box = screen.getByLabelText('Consensus for Kid 30');
    fireEvent.change(box, { target: { value: '75' } });
    fireEvent.blur(box);
    await waitFor(() => expect(log.puts).toHaveLength(1));
    await waitFor(() => expect(finish.disabled).toBe(false));
    fireEvent.click(finish);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.find(w => w.path === 'leagues/fbajc/S79/classRanking.json')!.baseVersion).toBe('0000000000000002');
  });

  it('refuses to finish off-step, with the calendar problem, and posts nothing', async () => {
    const log = stubApi(docsFor(filled(false)));
    renderPage();
    fireEvent.click(await enabled('Finish ranking'));
    expect(await screen.findByText('The class is ranked at the Rank S80 Class step (current step: Create S80 Class)')).toBeTruthy();
    expect(log.batches).toHaveLength(0);
  });

  it('is read-only once ranked', async () => {
    const s = filled();
    stubApi(docsFor({ ...s, ranking: { ...s.ranking!, locked: true } }));
    renderPage();
    expect(await screen.findByText(/The S80 class is ranked/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finish ranking' })).toBeNull();
    expect((screen.getByLabelText('Consensus for Kid 01') as HTMLInputElement).disabled).toBe(true);
  });
});
