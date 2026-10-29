// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOC_KEYS, docPath } from '../../engine/roster/state';
import { baseState } from '../../engine/roster/testFixtures';
import { stubApi } from '../d2/testDocs';
import { RosterTrimPage } from './RosterTrimPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
const docs = (build: (s: ReturnType<typeof baseState>) => void = () => {}): Record<string, unknown> => {
  const s = baseState();
  build(s);
  const d: Record<string, unknown> = {
    'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    'leagues/fba/teams.json': { league: 'fba', teams: ['BOS', 'CAR', 'MON'].map(t => ({ teamId: t, name: `${t} Team`, abbr: t, group: 'E', logoFolder: null, badge })) },
  };
  for (const k of DOC_KEYS) d[docPath(k, 79)] = s[k];
  return d;
};
const withDuplicate = (s: ReturnType<typeof baseState>) => {
  s.fba.teams.CAR = [...s.fba.teams.CAR, { playerId: 'p00030', position: 'PG', rating: 60, age: 21, points: 0, contractEnd: 81, contractAmount: 1, restricted: true }];
};
const renderPage = () => render(<MemoryRouter><RosterTrimPage /></MemoryRouter>);

describe('RosterTrimPage', () => {
  it('Keep hides the player, saving the choice for the season', async () => {
    const log = stubApi(docs(withDuplicate));
    renderPage();
    const table = await screen.findByRole('table', { name: 'CAR Team players to cut' });
    fireEvent.click(within(table).getAllByRole('button').find(b => b.getAttribute('aria-label')?.startsWith('Keep'))!);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes).toHaveLength(1);
    expect(log.batches[0].writes[0].path).toBe('leagues/fba/S79/trimKept.json');
    expect(log.batches[0].writes[0].doc).toMatchObject({ league: 'fba', season: 79, kept: [expect.any(String)] });
  });
  it('hides the players already kept and offers to show them again', async () => {
    const d = docs(withDuplicate);
    d['leagues/fba/S79/trimKept.json'] = { league: 'fba', season: 79, kept: ['p00030', 'p00006'] };
    const log = stubApi(d);
    renderPage();
    expect(await screen.findByText('No team has two players at the same position or a rookie rated 65 or lower.')).toBeTruthy();
    expect(screen.getByText(/2 kept players are hidden/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show them again' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes[0].doc).toMatchObject({ kept: [] });
  });
  it('lists only the teams with a duplicate position', async () => {
    stubApi(docs(withDuplicate));
    renderPage();
    expect(await screen.findByText('1 team has players to consider cutting.')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'CAR Team players to cut' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'BOS Team players to cut' })).toBeNull();
  });
  it('says so when no team has a duplicate', async () => {
    stubApi(docs());
    renderPage();
    expect(await screen.findByText('No team has two players at the same position or a rookie rated 65 or lower.')).toBeTruthy();
  });
  it('cuts a player in one batch and sends him to the free agent pool', async () => {
    const log = stubApi(docs(withDuplicate));
    renderPage();
    const table = await screen.findByRole('table', { name: 'CAR Team players to cut' });
    const cut = within(table).getAllByRole('button').find(b => b.getAttribute('aria-label')?.startsWith('Cut'))!;
    fireEvent.click(cut);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toMatch(/^Cut /);
    const paths = log.batches[0].writes.map(w => w.path).sort();
    expect(paths).toContain(docPath('freeAgents', 79));
    expect(paths).toContain(docPath('fba', 79));
  });
});
