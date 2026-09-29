// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOF_PATH, HOF_STEP, NOMINEE_CAP } from '../../engine/offseason/hallOfFame';
import { calendarFor } from '../../engine/shared/calendar';
import type { CalendarFile, HallOfFameFile, HofCard, PlayersFile, SummaryFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { HallOfFamePage } from './HallOfFamePage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const META = { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } };
const TX_PATH = 'leagues/fba/S79/transactions.json';

const calendarAt = (stepId: string): CalendarFile => {
  const cal = calendarFor(79);
  const at = cal.steps.findIndex(s => s.id === stepId);
  return { ...cal, steps: cal.steps.map((s, i) => ({ ...s, done: i < at })) };
};
const pid = (n: number) => `p${String(n).padStart(5, '0')}`;
const retired = (season: number) => ({ season, league: 'fba' as const, teamId: 'BOS', position: 'PG' as const });
const players = (): PlayersFile => ({
  nextId: 20,
  players: {
    [pid(1)]: { id: pid(1), name: 'Zed Zephyr', birthSeason: 46, retired: retired(79) },
    [pid(2)]: { id: pid(2), name: 'Al Able', birthSeason: 46, retired: retired(78) },
    [pid(3)]: { id: pid(3), name: 'Bo Baker', birthSeason: 46 },
  },
});
const card = (name: string, lines: string[] = [], retiredSeason = 'S70'): HofCard => ({ name, playerId: null, retiredSeason, lines });
const hof = (over: Partial<HallOfFameFile> = {}): HallOfFameFile => ({ league: 'fba', classes: [], nominees: [], removed: [], ...over });
const summaries = [{
  league: 'fba', season: 78, locked: true, host: null, champions: [],
  awards: [{ award: 'MVP', playerId: pid(2), teamId: 'BOS' }],
}] as unknown as SummaryFile[];

function docs(h: HallOfFameFile | null, calendar: CalendarFile = calendarAt(HOF_STEP)): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'meta.json': META,
    'calendar.json': calendar,
    'players.json': players(),
    [TX_PATH]: { league: 'fba', season: 79, entries: [] },
    '/api/history/fba': { seasons: summaries },
  };
  if (h) out[HOF_PATH] = h;
  return out;
}

const renderPage = (tab?: string) => render(
  <MemoryRouter initialEntries={[`/league/fba/hall-of-fame${tab ? `?tab=${tab}` : ''}`]}><HallOfFamePage /></MemoryRouter>,
);

describe('HallOfFamePage', () => {
  it('asks for the import when the document is missing', async () => {
    stubApi(docs(null));
    renderPage();
    expect(await screen.findByText('Import the Hall of Fame first: run "npm run import -- --hall-of-fame" in web/.')).toBeTruthy();
  });

  it('shows the classes newest first with their cards', async () => {
    stubApi(docs(hof({
      classes: [
        { season: 'S8', inductees: [card('Old Timer', ['BOS: S1-S9'], 'S9')] },
        { season: 'S64', inductees: [card('Newer Guy', ['CAR: S50-S64', 'S60 MVP'], 'S64')] },
      ],
    })));
    renderPage();
    await screen.findByText('Newer Guy');
    const heads = screen.getAllByRole('heading', { level: 2 });
    expect(heads.map(h => h.textContent)).toEqual(['S64', 'S8']);
    const c = screen.getByText('Newer Guy').closest('.hof-card') as HTMLElement;
    expect(c.textContent).toContain('Retired S64');
    expect(within(c).getByText('S60 MVP')).toBeTruthy();
    expect(within(c).getByText('CAR: S50-S64')).toBeTruthy();
  });

  it('shows the nominee count and saves edited lines on blur', async () => {
    const log = stubApi(docs(hof({ nominees: [card('Ann Ash', ['one'])] })));
    renderPage('nominees');
    expect(await screen.findByText('1 of 15')).toBeTruthy();
    const box = screen.getByLabelText('Ann Ash lines') as HTMLTextAreaElement;
    expect(box.value).toBe('one');
    fireEvent.change(box, { target: { value: 'one\ntwo\n' } });
    fireEvent.blur(box);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes).toHaveLength(1);
    const w = log.batches[0].writes[0];
    expect(w.path).toBe(HOF_PATH);
    expect((w.doc as HallOfFameFile).nominees[0].lines).toEqual(['one', 'two']);
    expect(w.baseVersion).toBe('0000000000000001');
  });

  it('does not save when the lines are unchanged', async () => {
    const log = stubApi(docs(hof({ nominees: [card('Ann Ash', ['one'])] })));
    renderPage('nominees');
    const box = await screen.findByLabelText('Ann Ash lines');
    fireEvent.blur(box);
    await new Promise(r => setTimeout(r, 20));
    expect(log.batches).toHaveLength(0);
  });

  it('removes a nominee only after confirming', async () => {
    const log = stubApi(docs(hof({ nominees: [card('Ann Ash'), card('Ben Birch')] })));
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    renderPage('nominees');
    const c = (await screen.findByText('Ann Ash')).closest('.hof-card') as HTMLElement;
    fireEvent.click(within(c).getByRole('button', { name: 'Remove' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(log.batches).toHaveLength(0);
    confirm.mockReturnValue(true);
    fireEvent.click(within(c).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    const doc = log.batches[0].writes[0].doc as HallOfFameFile;
    expect(doc.nominees.map(n => n.name)).toEqual(['Ben Birch']);
    expect(doc.removed.map(n => n.name)).toEqual(['Ann Ash']);
  });

  it('previews candidates and adds the selected ones in one write', async () => {
    const log = stubApi(docs(hof()));
    renderPage('nominees');
    const list = await screen.findByRole('list', { name: 'Candidates' });
    // Bo Baker is not retired, so only two candidates; newest retirement first.
    expect(within(list).getAllByRole('listitem').filter(li => li.closest('ul, ol') === list).map(li => li.textContent)).toEqual([
      expect.stringContaining('Zed Zephyr'),
      expect.stringContaining('Al Able'),
    ]);
    expect(within(list).getByText('S78 MVP')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Select Zed Zephyr'));
    fireEvent.click(screen.getByLabelText('Select Al Able'));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.map(w => w.path)).toEqual([HOF_PATH]);
    const doc = log.batches[0].writes[0].doc as HallOfFameFile;
    expect(doc.nominees.map(n => n.name)).toEqual(['Zed Zephyr', 'Al Able']);
    expect(doc.nominees[1].lines).toContain('S78 MVP');
  });

  it('shows the cap problem and posts nothing past the cap', async () => {
    const full = Array.from({ length: NOMINEE_CAP }, (_, i) => card(`Nom ${String.fromCharCode(65 + i)}`));
    const log = stubApi(docs(hof({ nominees: full })));
    renderPage('nominees');
    expect(await screen.findByText('15 of 15')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Select Zed Zephyr'));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected' }));
    expect((await screen.findByText(/capped at 15/)).className).toBe('error');
    expect(log.batches).toHaveLength(0);
  });

  it('adds a free-name nominee', async () => {
    const log = stubApi(docs(hof()));
    renderPage('nominees');
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: ' Old Legend ' } });
    fireEvent.change(screen.getByLabelText('Retired season'), { target: { value: 'S12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add nominee' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    const doc = log.batches[0].writes[0].doc as HallOfFameFile;
    expect(doc.nominees).toEqual([{ name: 'Old Legend', playerId: null, retiredSeason: 'S12', lines: [] }]);
  });

  it('inducts three ticked nominees in one batch', async () => {
    const log = stubApi(docs(hof({ nominees: [card('Ann Ash'), card('Ben Birch'), card('Cal Cook'), card('Dee Dane')] })));
    renderPage('nominees');
    await screen.findByText('4 of 15');
    for (const n of ['Ann Ash', 'Cal Cook', 'Dee Dane']) fireEvent.click(screen.getByLabelText(`Induct ${n}`));
    fireEvent.click(screen.getByRole('button', { name: 'Induct class' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual(['calendar.json', HOF_PATH, TX_PATH].sort());
    const doc = log.batches[0].writes.find(w => w.path === HOF_PATH)!.doc as HallOfFameFile;
    expect(doc.classes[0].season).toBe('S79');
    expect(doc.classes[0].inductees.map(i => i.name)).toEqual(['Ann Ash', 'Cal Cook', 'Dee Dane']);
    expect(doc.nominees.map(n => n.name)).toEqual(['Ben Birch']);
  });

  it('explains that the class needs nominees when there are none', async () => {
    stubApi(docs(hof()));
    renderPage('nominees');
    expect(await screen.findByText(/The class needs nominees/)).toBeTruthy();
  });

  it('disables induction with the calendar text before the step is current', async () => {
    const log = stubApi(docs(hof({ nominees: [card('Ann Ash')] }), calendarAt('retirement')));
    renderPage('nominees');
    const button = await screen.findByRole('button', { name: 'Induct class' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/The Hall of Fame class is inducted/)).toBeTruthy();
    expect(log.batches).toHaveLength(0);
  });
});
