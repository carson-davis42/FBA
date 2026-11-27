// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRatings } from '../../engine/d2/ratings';
import { d2Name, type D2State } from '../../engine/d2/state';
import { d2BaseState, d2RatedState, onePass } from '../../engine/d2/testFixtures';
import { applyAllSuggestions, setRating, takeRest } from '../../engine/rank/ranking';
import type { RankingFile } from '../../engine/shared/types';
import { docsFor, stubApi } from '../d2/testDocs';
import { D2RatingsPage } from './D2RatingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(<MemoryRouter><D2RatingsPage /></MemoryRouter>);

const staged = (): D2State => {
  const r = startRatings({ ...d2BaseState(), prevD2: null });
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
};
/** A one-pass reset, as one begun before the position stages. */
const started = (): D2State => {
  const s = staged();
  return { ...s, ratings: onePass(s.ratings!) };
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

  it('starts an untouched reset at the position rankings and autosaves a pick', async () => {
    const log = stubApi(docsFor(started()));
    renderPage();
    const table = await screen.findByRole('table', { name: 'PG not ranked' });
    expect(within(table).getAllByRole('button').map(b => b.textContent)).toEqual(['Ben Montgomery', 'Milo Dean', 'Kris Dyer']);
    expect(screen.getByRole('group', { name: 'Position' }).textContent).toContain('PG 0/3');
    expect((screen.getByRole('button', { name: /^Cut: send the other 0 to Reserves/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(table).getByRole('button', { name: 'Rank Milo Dean next at PG' }));
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0]).toMatchObject({ path: 'leagues/fbad2/S79/ratings.json', ifMatch: '"0000000000000001"' });
    expect((log.puts[0].doc as RankingFile).byPosition!.PG).toEqual(['p00025']);
  });

  it('cuts once every position is full, then offers the best remaining player at each position', async () => {
    const log = stubApi(docsFor(staged()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Fill every position, in order' }));
    const cut = screen.getByRole('button', { name: /^Cut: send the other/ }) as HTMLButtonElement;
    await waitFor(() => expect(cut.disabled).toBe(false));
    fireEvent.click(cut);
    const next = await screen.findByRole('table', { name: 'Next up' });
    expect(within(next).getAllByRole('row')).toHaveLength(6);
    expect(screen.getByText(/Step 3 of 4/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Take the rest in order' }));
    expect(await screen.findByText(/Step 4 of 4/)).toBeTruthy();
    expect(screen.getAllByLabelText(/^New rating for/)).toHaveLength(13);
    await waitFor(() => expect((log.puts.at(-1)!.doc as RankingFile).order).toHaveLength(13));
  });

  it("shows an under-way one-pass reset as before, with the New group and FBA rating", async () => {
    const s = started();
    stubApi(docsFor({ ...s, ratings: { ...s.ratings!, order: ['p00028'] } }));
    renderPage();
    const table = await screen.findByRole('table', { name: "Last season's order" });
    expect(screen.getByRole('group', { name: 'D2 spots left per position' }).textContent).toContain('C 63');
    expect(within(table).getByText('FBA 71')).toBeTruthy();
    expect(within(table).getByText('Kyron Smart').closest('tr')!.textContent).toContain('New');
    expect(screen.getByText("12 players aren't ranked yet")).toBeTruthy();
  });

  it('stretches the suggestion ladder of a reset started with a shorter one', async () => {
    const s = started();
    const old = { ...takeRest(s.ratings!, id => d2Name(s, id)), curve: [94, 85, 80, 75, 75, 72, 70, 68] };
    stubApi(docsFor({ ...s, ratings: old }));
    renderPage();
    await screen.findByRole('button', { name: 'Finish ratings' });
    // 10 roster slots in the fixture: ranks 9 and 10 now have a suggestion too.
    expect(screen.getAllByRole('button', { name: /^Use suggested/ })).toHaveLength(10);
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
