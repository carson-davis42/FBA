// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HallOfFameFile, HofCard, PlayersFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { HallOfFameHistoryPage } from './HallOfFameHistoryPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = {
  nextId: 3,
  players: {
    p00001: { id: 'p00001', name: 'Payton Atkinson', birthSeason: 46 },
    p00002: { id: 'p00002', name: 'Old Timer', birthSeason: 10 },
    p00003: { id: 'p00003', name: 'Mitchell Corey', birthSeason: 12 },
    p00004: { id: 'p00004', name: 'Twin Name', birthSeason: 12 },
    p00005: { id: 'p00005', name: 'Twin Name', birthSeason: 13 },
  },
};
const atkinson: HofCard = {
  name: 'Payton Atkinson', playerId: 'p00001', retiredSeason: 'S78',
  lines: ['Alabama: S64', 'FLO: S65-S76', 'NO: S77-S78', '14x All-Star', '2x Young-Star', '6x FBA C-Ship app.',
    '2x FBA Champion', '4x Conference Champion', '1x MC Award', '1x All-FBA T1', '5x All-FBA T2'],
};
const multi: HofCard = { name: 'Multi Stint', playerId: null, retiredSeason: 'S30', lines: ['West Virginia: S16-S18;S48', 'BOS: S49-S60', '2x MVP'] };
const old: HofCard = { name: 'Old Timer', playerId: null, retiredSeason: 'S9', lines: ['BOS: S1-S9', 'S5 MVP'] };
const hof = (over: Partial<HallOfFameFile> = {}): HallOfFameFile => ({ league: 'fba', classes: [], nominees: [], removed: [], ...over });

function renderPage(h: HallOfFameFile | null) {
  const docs: Record<string, unknown> = { 'players.json': players, '/api/history/fba': { seasons: [], errors: [] } };
  if (h) docs['leagues/fba/hallOfFame.json'] = h;
  stubApi(docs);
  return render(<MemoryRouter><HallOfFameHistoryPage /></MemoryRouter>);
}

describe('HallOfFameHistoryPage', () => {
  it('shows classes newest first, with Career and Honours split and a linked name', async () => {
    renderPage(hof({ classes: [{ season: 'S8', inductees: [old] }, { season: 'S78', inductees: [atkinson] }] }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Hall of Fame' })).toBeTruthy();
    const link = await screen.findByRole('link', { name: 'Payton Atkinson' });
    expect(link.getAttribute('href')).toBe('/history/fba/players/p00001');
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['S78', 'S8']);
    const card = link.closest('.hof-card') as HTMLElement;
    expect(card.textContent).toContain('Retired S78');
    const career = within(card).getByRole('list', { name: 'Career' });
    const honours = within(card).getByRole('list', { name: 'Honours' });
    expect(within(career).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Alabama: S64', 'FLO: S65-S76', 'NO: S77-S78']);
    expect(within(honours).getAllByRole('listitem')).toHaveLength(8);
    expect(within(honours).getAllByRole('listitem')[0].textContent).toBe('14x All-Star');
  });

  it('files a multi-part range under Career, not Honours', async () => {
    renderPage(hof({ classes: [{ season: 'S30', inductees: [multi] }] }));
    const card = (await screen.findByText('Multi Stint')).closest('.hof-card') as HTMLElement;
    const career = within(card).getByRole('list', { name: 'Career' });
    expect(within(career).getAllByRole('listitem').map(li => li.textContent)).toEqual(['West Virginia: S16-S18;S48', 'BOS: S49-S60']);
    expect(within(within(card).getByRole('list', { name: 'Honours' })).getAllByRole('listitem').map(li => li.textContent)).toEqual(['2x MVP']);
  });

  it('links an inductee with no player id by his name, including a respelled one, and leaves unknown or ambiguous names as text', async () => {
    const corey: HofCard = { name: 'Mitchel Corey', playerId: null, retiredSeason: 'S20', lines: ['BOS: S1-S20'] };
    const twin: HofCard = { name: 'Twin Name', playerId: null, retiredSeason: 'S21', lines: ['BOS: S1-S21'] };
    const ghost: HofCard = { name: 'Ghost Player', playerId: null, retiredSeason: 'S22', lines: ['BOS: S1-S22'] };
    renderPage(hof({ classes: [{ season: 'S22', inductees: [old, corey, twin, ghost] }] }));
    expect((await screen.findByRole('link', { name: 'Old Timer' })).getAttribute('href')).toBe('/history/fba/players/p00002');
    expect(screen.getByRole('link', { name: 'Mitchel Corey' }).getAttribute('href')).toBe('/history/fba/players/p00003');
    expect(screen.queryByRole('link', { name: 'Twin Name' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ghost Player' })).toBeNull();
    expect(screen.getByText('Ghost Player')).toBeTruthy();
  });

  it('links to the nominees and induction tool', async () => {
    renderPage(hof());
    const link = await screen.findByRole('link', { name: 'Nominees and induction' });
    expect(link.getAttribute('href')).toBe('/league/fba/hall-of-fame?tab=nominees');
  });

  it('shows the Hall without waiting for the season history', async () => {
    const docs: Record<string, unknown> = { 'players.json': players, 'leagues/fba/hallOfFame.json': hof({ classes: [{ season: 'S8', inductees: [old] }] }) };
    stubApi(docs);
    const inner = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => (url === '/api/history/fba' ? new Promise<Response>(() => {}) : inner(url, init))));
    render(<MemoryRouter><HallOfFameHistoryPage /></MemoryRouter>);
    expect(await screen.findByText('Old Timer')).toBeTruthy();
  });

  it('shows an unlinked card as plain text', async () => {
    renderPage(hof({ classes: [{ season: 'S8', inductees: [old] }] }));
    const name = await screen.findByText('Old Timer');
    expect(name.closest('a')).toBeNull();
    const card = name.closest('.hof-card') as HTMLElement;
    expect(within(card).getByText('S5 MVP')).toBeTruthy();
    expect(within(card).getByText('BOS: S1-S9')).toBeTruthy();
  });

  it('says so when no one has been inducted, or the document is missing', async () => {
    renderPage(hof());
    expect(await screen.findByText('No one has been inducted yet.')).toBeTruthy();
    cleanup();
    renderPage(null);
    expect(await screen.findByText('No one has been inducted yet.')).toBeTruthy();
  });
});
