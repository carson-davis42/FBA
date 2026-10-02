// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enterPortal } from '../../engine/college/portal';
import { addProjection } from '../../engine/college/recruiting';
import type { RecruitingResult, RecruitingState } from '../../engine/college/state';
import { collegeCurrentClassState } from '../../engine/college/testFixtures';
import type { CalendarFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { PortalPage } from './PortalPage';
import { recruitingDocs } from './testDocs';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(
  <MemoryRouter initialEntries={['/league/fbajc/portal']}>
    <Routes><Route path="/league/fbajc/portal" element={<PortalPage />} /></Routes>
  </MemoryRouter>,
);
const stepDone = (cal: CalendarFile, ...ids: string[]): CalendarFile => ({
  ...cal, steps: cal.steps.map(s => (ids.includes(s.id) ? { ...s, done: true } : s)),
});
/** S79 with the portal open (Make S79 Schedules done). Candidates: Baylor's Jaden Moss (So PG) and Omar Reed (Sr PF), Texas's Luis Vega (Jr PF). */
const openState = (): RecruitingState => {
  const s = collegeCurrentClassState();
  return { ...s, calendar: stepDone(s.calendar, 'make-s79-schedules') };
};
const ok = (r: RecruitingResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
};
const candidates = () => within(screen.getByRole('table', { name: 'Players who can enter the portal' })).queryAllByRole('row').slice(1)
  .map(r => (r as HTMLTableRowElement).cells[1].textContent);
const enabled = async (name: string) => {
  const b = await screen.findByRole('button', { name }) as HTMLButtonElement;
  await waitFor(() => expect(b.disabled).toBe(false));
  return b;
};

describe('PortalPage', () => {
  it('lists the candidates with school, class, position and rating', async () => {
    stubApi(recruitingDocs(openState()));
    renderPage();
    await screen.findByText('Jaden Moss');
    const rows = within(screen.getByRole('table', { name: 'Players who can enter the portal' })).getAllByRole('row').slice(1);
    const cells = rows.map(r => Array.from((r as HTMLTableRowElement).cells).slice(1, 6).map(c => c.textContent));
    expect(cells).toEqual([
      ['Jaden Moss', 'BAYBaylor', 'So', 'PG', '82'],
      ['Omar Reed', 'BAYBaylor', 'Sr', 'PF', '69'],
      ['Luis Vega', 'TEXTexas', 'Jr', 'PF', '66'],
    ]);
    expect(screen.getByText('The S79 transfer portal is open.')).toBeTruthy();
  });

  it('narrows by name, school, conference and position', async () => {
    stubApi(recruitingDocs(openState()));
    renderPage();
    await screen.findByText('Jaden Moss');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search names' }), { target: { value: 'ree' } });
    expect(candidates()).toEqual(['Omar Reed']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search names' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'School' }), { target: { value: 'TEX' } });
    expect(candidates()).toEqual(['Luis Vega']);
    fireEvent.change(screen.getByRole('combobox', { name: 'School' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Conference' }), { target: { value: 'ACC' } });
    expect(candidates()).toEqual([]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Conference' }), { target: { value: 'B12' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Position' }), { target: { value: 'PF' } });
    expect(candidates()).toEqual(['Omar Reed', 'Luis Vega']);
  });

  it('puts the ticked players in the portal as one batch', async () => {
    const log = stubApi(recruitingDocs(openState()));
    renderPage();
    expect((await screen.findByRole('button', { name: 'Put 0 players in the portal' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Jaden Moss' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Luis Vega' }));
    fireEvent.click(await enabled('Put 2 players in the portal'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('2 players enter the transfer portal');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([
      ['leagues/fbajc/S78/recruiting.json', '0000000000000001'],
      ['leagues/fbajc/S79/rosters.json', '0000000000000001'],
      ['leagues/fbajc/S79/transactions.json', '0000000000000001'],
    ]);
    expect(await screen.findByRole('heading', { name: 'In the portal · 2' })).toBeTruthy();
    expect(candidates()).toEqual(['Omar Reed']);
  });

  it('lists the portal by rating with the old school, projections and commitment, and takes a player out', async () => {
    let s = ok(enterPortal(openState(), ['p00485', 'p00488', 'p00503'], { batchId: 'b' }));
    s = ok(addProjection(s, 'p00488', 'TEX'));
    const log = stubApi(recruitingDocs(s));
    renderPage();
    const table = await screen.findByRole('table', { name: 'In the portal' });
    const rows = within(table).getAllByRole('row').slice(1).map(r => (r as HTMLTableRowElement).cells);
    expect(rows.map(c => c[0].textContent)).toEqual(['Jaden Moss', 'Omar Reed', 'Luis Vega']);
    expect(rows[0][1].textContent).toBe('from BAYBaylor');
    expect(rows[1][5].textContent).toContain('100% TEX');
    expect(rows[2][5].textContent).toContain('No projections');
    fireEvent.click(await enabled('Take out Luis Vega'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Luis Vega leaves the transfer portal and stays at Texas');
    expect(log.batches[0].writes.map(w => w.path)).toEqual([
      'leagues/fbajc/S78/recruiting.json', 'leagues/fbajc/S79/rosters.json', 'leagues/fbajc/S79/transactions.json',
    ]);
  });

  it('takes a player out before the portal opens (after Adjust Age), and not once the fbajc step is done', async () => {
    const s0 = ok(enterPortal(openState(), ['p00503'], { batchId: 'b' }));
    const preOpen = { ...s0, calendar: collegeCurrentClassState().calendar };
    const log = stubApi(recruitingDocs(preOpen));
    renderPage();
    expect(await screen.findByText('The S79 transfer portal opens when the offseason ends (after Make S79 Schedules)')).toBeTruthy();
    fireEvent.click(await enabled('Take out Luis Vega'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Luis Vega leaves the transfer portal and stays at Texas');
    cleanup();
    stubApi(recruitingDocs({ ...s0, calendar: stepDone(s0.calendar, 'fbajc') }));
    renderPage();
    const b = await screen.findByRole('button', { name: 'Take out Luis Vega' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });

  it('shows who a portal player committed to, without a Take out button', async () => {
    const s0 = ok(enterPortal(openState(), ['p00485'], { batchId: 'b' }));
    const s = { ...s0, recruiting: { ...s0.recruiting, portal: s0.recruiting.portal.map(p => ({ ...p, committedTo: 'DUKE' })) } };
    stubApi(recruitingDocs(s));
    renderPage();
    expect(await screen.findByText((_, el) => el?.tagName === 'STRONG' && /^Committed:.*Duke$/.test(el.textContent ?? ''))).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Take out Jaden Moss' })).toBeNull();
  });

  it('shows why the portal is closed and disables the controls', async () => {
    stubApi(recruitingDocs(collegeCurrentClassState()));
    renderPage();
    expect(await screen.findByText('The S79 transfer portal opens when the offseason ends (after Make S79 Schedules)')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Select Jaden Moss' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Put 0 players in the portal' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
