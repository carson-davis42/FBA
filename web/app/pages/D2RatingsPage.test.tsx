// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRatings } from '../../engine/d2/ratings';
import { d2Name, type D2State } from '../../engine/d2/state';
import { d2BaseState, d2RatedState } from '../../engine/d2/testFixtures';
import { applyAllSuggestions, setRating, takeRest } from '../../engine/rank/ranking';
import type { RankingFile } from '../../engine/shared/types';
import { docsFor, stubApi } from '../d2/testDocs';
import { D2RatingsPage } from './D2RatingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(<MemoryRouter><D2RatingsPage /></MemoryRouter>);

const started = (): D2State => {
  const r = startRatings({ ...d2BaseState(), prevD2: null });
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
};
/** Everyone ranked in last season's order and rated in order, so the reset can be finished. */
const complete = (s: D2State): D2State => {
  let doc = applyAllSuggestions(takeRest(s.ratings!, id => d2Name(s, id)));
  doc.order.slice(-5).forEach((id, k) => { doc = setRating(doc, id, 66 - 2 * k); });
  return { ...s, ratings: doc };
};

describe('D2RatingsPage', () => {
  it('asks to close free agency first', async () => {
    stubApi(docsFor({ ...d2BaseState(), freeAgencyClosed: false }));
    renderPage();
    expect(await screen.findByText(/Close free agency first/)).toBeTruthy();
  });

  it('starts the reset as one batch that creates ratings.json', async () => {
    const log = stubApi(docsFor(d2BaseState()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start ratings reset' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start D2 ratings reset');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fbad2/S79/ratings.json', null]]);
    expect((log.batches[0].writes[0].doc as RankingFile).kind).toBe('d2-reset');
  });

  it("lists last season's order, unrated Reserves after the rated players, then the FBA free agent as the only new player, and autosaves a click", async () => {
    const log = stubApi(docsFor(started()));
    renderPage();
    await screen.findByRole('button', { name: 'Rank Maddox Dean next' });
    expect(screen.getAllByRole('button', { name: /^Rank .* next$/ }).map(b => b.textContent)).toEqual([
      'Maddox Dean', 'Xavier Booker', 'Jalil Grant', 'Ben Montgomery', 'Jamal Edwards', 'Brooks Burrows', 'Milo Dean', 'Adrian Grant',
      'Adrian Napoletani', 'Brycen Holcomb', 'Kris Dyer', 'Myron Mason', 'Kyron Smart',
    ]);
    expect(screen.getByRole('group', { name: 'D2 spots left per position' }).textContent).toContain('PG 64');
    expect(within(screen.getByRole('table', { name: "Last season's order" })).getByText('FBA 71')).toBeTruthy();
    // Only the FBA free agent is new (Team column "New"); the other unrated Reserves were already in the pool.
    expect(within(screen.getByRole('table', { name: "Last season's order" })).getByText('Kyron Smart').closest('tr')!.textContent).toContain('New');
    expect(screen.getAllByText('Reserves')).toHaveLength(4);
    expect(screen.getByText("13 players aren't ranked yet")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rank Xavier Booker next' }));
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0]).toMatchObject({ path: 'leagues/fbad2/S79/ratings.json', ifMatch: '"0000000000000001"' });
    expect((log.puts[0].doc as RankingFile).order).toEqual(['p00028']);
  });

  it('finishes as one batch that includes the calendar', async () => {
    const log = stubApi(docsFor(complete(started())));
    renderPage();
    const finish = await screen.findByRole('button', { name: 'Finish ratings' });
    await waitFor(() => expect((finish as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(finish);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Finish D2 ratings');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
      'calendar.json', 'leagues/fbad2/S79/ratings.json', 'leagues/fbad2/S79/reserves.json',
      'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/S79/transactions.json',
    ]);
    expect(log.batches[0].writes.every(w => w.baseVersion === '0000000000000001')).toBe(true);
  });

  it('hands off to the version an autosave returned when Finish follows an edit', async () => {
    const s = complete(started());
    const log = stubApi(docsFor({ ...s, ratings: setRating(s.ratings!, 'p00040', null) }));
    renderPage();
    const finish = await screen.findByRole('button', { name: 'Finish ratings' });
    expect((finish as HTMLButtonElement).disabled).toBe(true);
    const input = screen.getByLabelText('New rating for Kris Dyer');
    fireEvent.change(input, { target: { value: '60' } });
    fireEvent.blur(input);
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0].ifMatch).toBe('"0000000000000001"');
    await waitFor(() => expect((finish as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(finish);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.find(w => w.path === 'leagues/fbad2/S79/ratings.json')!.baseVersion).toBe('0000000000000002');
  });

  it('is read-only and points to the pool once finished', async () => {
    stubApi(docsFor(d2RatedState()));
    renderPage();
    expect(await screen.findByText(/D2 ratings are finished/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finish ratings' })).toBeNull();
  });
});
