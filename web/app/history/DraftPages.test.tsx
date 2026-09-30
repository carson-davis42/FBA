// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DraftFile, DraftHistoryFile, PlayersFile } from '../../engine/shared/types';
import { DraftSeasonPage, draftLine } from './DraftSeasonPage';
import { DraftsPage } from './DraftsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = {
  nextId: 4,
  players: {
    p00001: { id: 'p00001', name: 'Ray Allen', birthSeason: 50 },
    p00002: { id: 'p00002', name: 'Cai Scott', birthSeason: 51 },
    p00003: { id: 'p00003', name: 'Dan Expo', birthSeason: 40 },
  },
};
const pick = (n: number | null, name: string, playerId: string | null, extra: Record<string, unknown> = {}) => ({
  pick: n, teamId: n === null ? null : 'SEA', teamName: n === null ? null : 'Seattle', viaTeamId: null,
  name, playerId, pos: 'PG', detail: 'Senior', college: 'Duke', ...extra,
});
const history: DraftHistoryFile = {
  drafts: [
    { season: 78, kind: 'draft', picks: [pick(1, 'Ray Allen', 'p00001', { viaTeamId: 'DEN' }), pick(null, 'Cai Scott', 'p00002')] },
    { season: 75, kind: 'draft', picks: [pick(1, 'Old Guy', null)] },
    { season: 75, kind: 'expansion', picks: [pick(1, 'Dan Expo', 'p00003', { detail: '31' })] },
  ],
};
const appDraft: DraftFile = {
  league: 'fba', season: 80, locked: false, started: true,
  prospects: [
    { playerId: 'p00001', position: 'PG', college: 'Duke', classYear: 'Sr', senior: true, collegeRating: 80, stars: 4, fbaRating: null },
    { playerId: 'p00002', position: 'C', college: 'Kansas', classYear: 'Jr', senior: false, collegeRating: 70, stars: 3, fbaRating: null },
  ],
  picks: [{ slot: 1, owner: 'SEA', originalTeam: 'DEN', playerId: 'p00001' }, { slot: 2, owner: 'DEN', originalTeam: 'DEN', playerId: null }],
};

function stub(opts: { history?: boolean; app?: boolean } = {}) {
  const docs: Record<string, unknown> = {
    '/api/state/players.json': players,
    '/api/state/meta.json': { currentSeason: 80 },
  };
  if (opts.history !== false) docs['/api/state/leagues/fba/draftHistory.json'] = history;
  if (opts.app) docs['/api/state/leagues/fba/S80/draft.json'] = appDraft;
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url in docs ? new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } }) : new Response('{}', { status: 404 })));
}

const renderSeason = (season: number) => render(
  <MemoryRouter initialEntries={[`/history/fba/drafts/${season}`]}>
    <Routes><Route path="/history/fba/drafts/:season" element={<DraftSeasonPage />} /></Routes>
  </MemoryRouter>,
);

describe('Draft pages', () => {
  it('the index lists each imported season, with + Exp. when an expansion draft exists', async () => {
    stub();
    render(<MemoryRouter><DraftsPage /></MemoryRouter>);
    const s78 = await screen.findByRole('link', { name: 'S78' });
    expect(s78.getAttribute('href')).toBe('/history/fba/drafts/78');
    const s75 = screen.getByRole('link', { name: 'S75 + Exp.' });
    expect(s75.getAttribute('href')).toBe('/history/fba/drafts/75');
  });

  it('shows a started app draft as a chip', async () => {
    stub({ app: true });
    render(<MemoryRouter><DraftsPage /></MemoryRouter>);
    expect((await screen.findByRole('link', { name: 'S80' })).getAttribute('href')).toBe('/history/fba/drafts/80');
  });

  it('says so when there is no draft history at all', async () => {
    stub({ history: false });
    render(<MemoryRouter><DraftsPage /></MemoryRouter>);
    expect(await screen.findByText('No draft history yet. Run npm run import -- --drafts --data data.')).toBeTruthy();
  });

  it('the season page lists picks in order with the via team and a player link', async () => {
    stub();
    renderSeason(78);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('S78 Draft');
    expect(screen.getByRole('link', { name: '← Drafts' }).getAttribute('href')).toBe('/history/fba/drafts');
    const link = await screen.findByRole('link', { name: 'Ray Allen' });
    expect(link.getAttribute('href')).toBe('/history/fba/players/p00001');
    const row = link.closest('tr') as HTMLElement;
    expect(within(row).getByText(/Seattle/)).toBeTruthy();
    expect(row.textContent).toContain('(via');
    expect(row.textContent).toContain('DEN');
  });

  it('lists the undrafted players', async () => {
    stub();
    renderSeason(78);
    await screen.findByRole('heading', { name: 'Undrafted' });
    expect(screen.getByText('Cai Scott')).toBeTruthy();
  });

  it('shows the expansion draft section with an Age column', async () => {
    stub();
    renderSeason(75);
    await screen.findByRole('heading', { name: 'Expansion draft' });
    expect(screen.getByText('Age')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dan Expo' })).toBeTruthy();
  });

  it('reads an app draft when the season is not imported', async () => {
    stub({ history: false, app: true });
    renderSeason(80);
    const link = await screen.findByRole('link', { name: 'Ray Allen' });
    const row = link.closest('tr') as HTMLElement;
    expect(row.textContent).toContain('Duke');
    expect(row.textContent).toContain('SEA');
    expect(row.textContent).toContain('(via');
    expect(row.textContent).toContain('Sr');
  });

  it('reports an unknown season', async () => {
    stub();
    renderSeason(12);
    expect(await screen.findByText('No S12 draft on record.')).toBeTruthy();
  });
});

describe('draftLine', () => {
  it('describes a pick, an expansion pick, an undrafted player and none', () => {
    expect(draftLine(history, 'p00001')).toBe('Drafted S78, #1 by Seattle');
    expect(draftLine(history, 'p00003')).toBe('Expansion draft S75, #1 by Seattle');
    expect(draftLine(history, 'p00002')).toBe('Undrafted, S78');
    expect(draftLine(history, 'p09999')).toBeNull();
    expect(draftLine(null, 'p00001')).toBeNull();
  });
});
