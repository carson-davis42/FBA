// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { lotteryPath, runLottery, type LotteryState } from '../../engine/offseason/lottery';
import { calendar, ctx, state } from '../../engine/offseason/testFixtures';
import type { LotteryFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { LotteryPage } from './LotteryPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const META = { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } };

const docsFor = (s: LotteryState): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    'meta.json': META,
    'calendar.json': s.calendar,
    'leagues/fba/teams.json': s.teams,
    'leagues/fba/S79/results.json': s.results,
    'leagues/fba/picks.json': s.picks,
    'leagues/fba/S79/transactions.json': s.tx,
  };
  if (s.playoffs) out['leagues/fba/S79/playoffs.json'] = s.playoffs;
  if (s.lottery) out[lotteryPath(79)] = s.lottery;
  return out;
};

/** A run of the lottery whose doc is served as already saved. */
const saved = (): LotteryFile => {
  const r = runLottery(state(), mulberry32(5), ctx);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.writes[0].doc as LotteryFile;
};

const renderPage = () => render(<MemoryRouter><LotteryPage /></MemoryRouter>);

describe('LotteryPage', () => {
  it('shows the odds table before the run', async () => {
    stubApi(docsFor(state()));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'S80 Draft Lottery' })).toBeTruthy();
    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(rows).toHaveLength(14);
    expect(within(rows[0]).getByText('T29')).toBeTruthy();
    expect(within(rows[0]).getByText('0-29')).toBeTruthy();
    expect(within(rows[0]).getByText('14.0%')).toBeTruthy();
    expect(within(rows[13]).getByText('0.5%')).toBeTruthy();
  });

  it('runs the lottery as one batch of four documents', async () => {
    const log = stubApi(docsFor(state()));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Run lottery' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('S80 Draft Lottery');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([
      [lotteryPath(79), null],
      ['leagues/fba/picks.json', '0000000000000001'],
      ['leagues/fba/S79/transactions.json', '0000000000000001'],
      ['calendar.json', '0000000000000001'],
    ]);
    // The run starts hidden: nothing is revealed until the user says so.
    await waitFor(() => expect(screen.getAllByText('?')).toHaveLength(14));
    expect(screen.queryByText(/Full S80 draft order/)).toBeNull();
  });

  it('reveals a saved lottery from the last pick up, then shows the whole order', async () => {
    const lot = saved();
    stubApi(docsFor(state({ lottery: lot, calendar: calendar('never') })));
    renderPage();
    // A reload shows everything at once.
    expect(await screen.findByRole('heading', { name: /Full S80 draft order/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reveal next' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reveal all' })).toBeNull();
    expect(screen.getAllByRole('row')).toHaveLength(31);
  });

  it('hides only the last pick until Reveal next, and Reveal all shows pick 1', async () => {
    // Run in this mount so the reveal starts at zero.
    const s = state();
    const log = stubApi(docsFor(s));
    renderPage();
    const run = await screen.findByRole('button', { name: 'Run lottery' });
    await waitFor(() => expect((run as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(run);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    const lot = log.batches[0].writes[0].doc as LotteryFile;
    await screen.findByRole('button', { name: 'Reveal next' });
    const list = screen.getByRole('list', { name: 'Lottery' });
    expect(within(list).getAllByText('?')).toHaveLength(14);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal next' }));
    const items = within(list).getAllByRole('listitem');
    expect(items[0].textContent).toContain('14');
    expect(items[0].textContent).toContain(lot.lottery[13]);
    expect(within(list).getAllByText('?')).toHaveLength(13);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal all' }));
    expect(within(list).queryAllByText('?')).toHaveLength(0);
    expect(list.textContent).toContain(lot.lottery[0]);
    expect(screen.queryByRole('button', { name: 'Reveal all' })).toBeNull();
    expect(await screen.findByRole('heading', { name: /Full S80 draft order/ })).toBeTruthy();
  });

  it('lists the full order with "via" for traded picks and shows flags', async () => {
    const lot = saved();
    lot.picks = lot.picks.map(p => (p.slot === 2 ? { ...p, owner: p.originalTeam === 'T07' ? 'T08' : 'T07' } : p.slot === 3 ? { ...p, flag: 'Conveyance needs a decision' } : p));
    stubApi(docsFor(state({ lottery: lot, calendar: calendar('never') })));
    renderPage();
    await screen.findByRole('heading', { name: /Full S80 draft order/ });
    const table = screen.getAllByRole('table').at(-1)!;
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(30);
    expect(rows[1].textContent).toContain(`via ${lot.picks[1].originalTeam}`);
    expect(rows[0].textContent).not.toContain('via');
    expect(rows[2].textContent).toContain('Conveyance needs a decision');
    expect(screen.getByText('Settle flagged picks by hand in the picks editor.')).toBeTruthy();
  });

  it('disables the run with the calendar problem when the step is not current', async () => {
    stubApi(docsFor(state({ calendar: { ...calendar(), steps: calendar().steps.map(s => ({ ...s, done: false })) } })));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Run lottery' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/The lottery is run at the S80 FBA Draft Lottery step/)).toBeTruthy();
  });
});
