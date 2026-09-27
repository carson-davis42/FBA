// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setRating, startRatings } from '../../engine/d2/ratings';
import type { D2State } from '../../engine/d2/state';
import { d2BaseState } from '../../engine/d2/testFixtures';
import type { D2RatingsFile } from '../../engine/shared/types';
import { docsFor, stubApi } from '../d2/testDocs';
import { D2RatingsPage } from './D2RatingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(<MemoryRouter><D2RatingsPage /></MemoryRouter>);

const started = (): D2State => {
  const r = startRatings({ ...d2BaseState(), prevD2: null }, () => 0.5);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
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
  });

  it('groups blank players first, counts them, tags FBA free agents, and blocks Finish', async () => {
    stubApi(docsFor(started()));
    renderPage();
    expect(await screen.findByText('Needs a rating · 5')).toBeTruthy();
    expect(screen.getByText('5 need a rating')).toBeTruthy();
    expect(screen.getByText('5 players still need a rating')).toBeTruthy();
    expect(screen.getByText('FBA FA', { selector: '.tag' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Finish ratings' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('filters by position tab and sorts rated players by new rating', async () => {
    stubApi(docsFor(started()));
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /^PG/ }));
    const wrap = screen.getByText('Rated · 2').nextElementSibling as HTMLElement;
    const names = within(wrap).getAllByRole('row').slice(1).map(r => (r as HTMLTableRowElement).cells[0].textContent);
    expect(names).toEqual(['Ben Montgomery', 'Milo Dean']);
    expect(screen.queryByText('Kyron Smart')).toBeNull();
  });

  it('autosaves an edited rating with If-Match', async () => {
    const log = stubApi(docsFor(started()));
    renderPage();
    const input = await screen.findByLabelText('New rating for Kris Dyer');
    fireEvent.change(input, { target: { value: '78' } });
    fireEvent.blur(input);
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0].path).toBe('leagues/fbad2/S79/ratings.json');
    expect(log.puts[0].ifMatch).toBe('"0000000000000001"');
    expect((log.puts[0].doc as D2RatingsFile).players.find(r => r.playerId === 'p00040')!.rating).toBe(78);
  });

  it('rejects an invalid rating without saving', async () => {
    const log = stubApi(docsFor(started()));
    renderPage();
    const input = await screen.findByLabelText('New rating for Kris Dyer');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(await screen.findByText('Enter a whole number from 1 to 99')).toBeTruthy();
    expect(log.puts).toHaveLength(0);
  });

  it('finishes as one batch that includes the calendar', async () => {
    const s = started();
    let ratings = s.ratings!;
    for (const [id, v] of [['p00040', 78], ['p00041', 74], ['p00042', 70], ['p00043', 60], ['p00044', 65]] as const) ratings = setRating(ratings, id, v);
    const log = stubApi(docsFor({ ...s, ratings }));
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

  it('hands off to the version an autosave returned, not the originally loaded one, when Finish follows an edit', async () => {
    const s = started();
    let ratings = s.ratings!;
    for (const [id, v] of [['p00041', 74], ['p00042', 70], ['p00043', 60], ['p00044', 65]] as const) ratings = setRating(ratings, id, v);
    const log = stubApi(docsFor({ ...s, ratings }));
    renderPage();
    const input = await screen.findByLabelText('New rating for Kris Dyer');
    fireEvent.change(input, { target: { value: '78' } });
    fireEvent.blur(input);
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0].ifMatch).toBe('"0000000000000001"');

    const finish = await screen.findByRole('button', { name: 'Finish ratings' });
    await waitFor(() => expect((finish as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(finish);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    const write = log.batches[0].writes.find(w => w.path === 'leagues/fbad2/S79/ratings.json')!;
    expect(write.baseVersion).toBe('0000000000000002');
  });
});
