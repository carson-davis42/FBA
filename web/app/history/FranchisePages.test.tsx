// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DraftHistoryFile, FranchisesFile, LogoManifest, PlayersFile, SummaryFile, TeamsFile } from '../../engine/shared/types';
import { FranchisePage } from './FranchisePage';
import { TeamsHistoryPage } from './TeamsHistoryPage';
import { logoUrl } from '../components/logoUrl';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = {
  nextId: 3,
  players: {
    p00001: { id: 'p00001', name: 'Cameron Lučić', birthSeason: 40 },
    p00002: { id: 'p00002', name: 'Ray Allen', birthSeason: 41 },
  },
};
const mkTeam = (teamId: string, name: string, abbr: string, logoFolder: string | null = null) =>
  ({ teamId, name, abbr, group: null, logoFolder, badge: { bg: '#000', fg: '#fff' } });
const teamsFile = (logoFolder: string | null = null): TeamsFile => ({
  league: 'fba', teams: [mkTeam('SAS', 'San Antonio Spirits', 'SAS', logoFolder), mkTeam('MON', 'Montreal Chevaliers', 'MON')],
});
const franchises: FranchisesFile = {
  franchises: [
    { teamId: 'SAS', eras: [
      { name: 'San Antonio Spirits', abbr: 'SAS', city: 'San Antonio, Texas', from: 57, to: null },
      { name: 'San Antonio', abbr: 'USA', city: 'San Antonio, Texas', from: 1, to: 56 },
    ] },
    { teamId: 'MON', eras: [{ name: 'Montreal', abbr: 'MON', city: 'Montreal, Quebec, Canada', from: 1, to: null }] },
  ],
};
const s20 = {
  league: 'fba', locked: true, host: null, season: 20,
  champions: [{ title: 'FBA Champion', champion: 'San Antonio', runnerUp: 'Montreal', score: '1–0' }],
  confChampions: { E: 'Montreal', W: 'San Antonio' },
  awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'USA' }],
} as SummaryFile;
const drafts: DraftHistoryFile = {
  drafts: [{
    season: 30, kind: 'draft',
    picks: [{ pick: 1, teamId: 'SAS', teamName: 'San Antonio', viaTeamId: null, name: 'Top Pick', playerId: 'p00002', pos: 'PG', detail: null, college: 'Duke' }],
  }],
};

function stub(opts: { drafts?: boolean; manifest?: LogoManifest; logoFolder?: string; noFranchises?: boolean; draftsFail?: boolean; extra?: Record<string, unknown> } = {}) {
  const docs: Record<string, unknown> = {
    '/api/history/fba': { seasons: [s20], errors: [] },
    '/api/state/players.json': players,
    '/api/state/leagues/fba/teams.json': teamsFile(opts.logoFolder ?? null),
    '/api/state/leagues/fba/franchises.json': franchises,
    '/api/state/leagues/fba/hallOfFame.json': { league: 'fba', classes: [], nominees: [], removed: [] },
  };
  if (opts.drafts !== false) docs['/api/state/leagues/fba/draftHistory.json'] = drafts;
  if (opts.manifest) docs['/api/state/logos/manifest.json'] = opts.manifest;
  if (opts.noFranchises) delete docs['/api/state/leagues/fba/franchises.json'];
  Object.assign(docs, opts.extra);
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    opts.draftsFail && url === '/api/state/leagues/fba/draftHistory.json' ? new Response('boom', { status: 500 }) :
    url in docs ? new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } }) : new Response('{}', { status: 404 })));
}

const renderFranchise = (teamId = 'SAS', search = '') => render(
  <MemoryRouter initialEntries={[`/history/fba/teams/${teamId}${search}`]}>
    <Routes><Route path="/history/fba/teams/:teamId" element={<FranchisePage />} /></Routes>
  </MemoryRouter>,
);

describe('Franchise pages', () => {
  it('the Teams grid links each franchise with its counts', async () => {
    stub();
    render(<MemoryRouter><TeamsHistoryPage /></MemoryRouter>);
    const cards = await screen.findAllByRole('link');
    const sas = cards.find(a => a.getAttribute('href') === '/history/fba/teams/SAS')!;
    expect(sas.textContent).toContain('1 title ·');
    expect(sas.textContent).toContain('1 Finals appearance ·');
    expect(sas.textContent).toContain('San Antonio Spirits');
    // the name and the counts are stacked, not run together on one line
    expect(sas.classList.contains('team-card')).toBe(true);
  });

  it('the Teams grid shows the current-season logo and the debut logos of expansion teams not yet in teams.json', async () => {
    const withExpansion: FranchisesFile = {
      franchises: [
        ...franchises.franchises,
        { teamId: 'PHI', eras: [{ name: 'Philly Phantoms', abbr: 'PHI', city: 'Philadelphia, Pennsylvania', from: 80, to: null }] },
        { teamId: 'LAL', eras: [{ name: 'Los Angeles Labradors', abbr: 'LAL', city: 'Los Angeles, California', from: 80, to: null }] },
      ],
    };
    stub({
      logoFolder: 'San Antonio Spirits',
      extra: {
        '/api/state/leagues/fba/franchises.json': withExpansion,
        '/api/state/meta.json': { currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 80, fbawc: 80 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 } },
      },
    });
    render(<MemoryRouter><TeamsHistoryPage /></MemoryRouter>);
    const cards = await screen.findAllByRole('link');
    const card = (id: string) => cards.find(a => a.getAttribute('href') === `/history/fba/teams/${id}`)!;
    // the logo season is the current season (80), not the last played one (79)
    expect(within(card('SAS')).getByRole('img').getAttribute('src')).toBe(logoUrl('San Antonio Spirits', 80));
    // expansion teams use their definitions: PHI's logo folder, and Team 32's own logo folder
    expect(within(card('PHI')).getByRole('img').getAttribute('src')).toBe(logoUrl('Philly Phantoms', 80));
    expect(card('PHI').textContent).toContain('Philly Phantoms');
    expect(within(card('LAL')).getByRole('img').getAttribute('src')).toBe(logoUrl('Team 32', 80));
    expect(card('LAL').textContent).toContain('Team 32');
    expect(card('LAL').textContent).not.toContain('Labradors');
  });

  it('shows the franchise hero, era tiles and championship chips', async () => {
    stub();
    renderFranchise();
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('San Antonio Spirits');
    const tiles = screen.getAllByRole('listitem').filter(li => li.className === 'era-tile');
    expect(tiles).toHaveLength(2);
    expect(tiles[0].textContent).toContain('San Antonio Spirits');
    expect(tiles[0].textContent).toContain('S57–pres.');
    expect(tiles[1].textContent).toContain('San Antonio');
    expect(tiles[1].textContent).toContain('S1–S56');
    const chip = screen.getAllByRole('link', { name: 'S20' })[0];
    expect(chip.getAttribute('href')).toBe('/history/fba/season/20');
  });

  it('links the award winner', async () => {
    stub();
    renderFranchise();
    const link = await screen.findByRole('link', { name: 'Cameron Lučić' });
    expect(link.getAttribute('href')).toBe('/history/fba/players/p00001');
    expect(link.closest('li')!.textContent).toContain('MVP');
  });

  it('lists a draft pick', async () => {
    stub();
    renderFranchise();
    expect(await screen.findByRole('heading', { name: 'Draft picks' })).toBeTruthy();
    const row = screen.getByRole('link', { name: 'Ray Allen' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('S30')).toBeTruthy();
    expect(within(row).getByText('Duke')).toBeTruthy();
  });

  it('hides Draft picks when the draft history is missing', async () => {
    stub({ drafts: false });
    renderFranchise();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('heading', { name: 'Draft picks' })).toBeNull();
  });

  it('shows the era logo from the manifest', async () => {
    stub({ logoFolder: 'San Antonio', manifest: { folders: { 'San Antonio': [{ file: 'x.png', from: 57, to: null, variant: 0 }] } } });
    renderFranchise();
    await screen.findByRole('heading', { level: 1 });
    const tile = screen.getAllByRole('listitem').find(li => li.textContent?.includes('S57–pres.'))!;
    expect(within(tile).getByRole('img').getAttribute('src')).toBe(logoUrl('San Antonio', 57));
  });

  describe('a logo that starts in a later season', () => {
    const manifest = (): LogoManifest => ({ folders: { 'San Antonio': [
      { file: 'San Antonio S57-S79.png', from: 57, to: 79, variant: 0 },
      { file: 'San Antonio S80-pres..png', from: 80, to: null, variant: 0 },
    ] } });
    const calendar = (season: number) => ({ '/api/state/calendar.json': { season, steps: [] } });
    const tiles = () => screen.getAllByRole('listitem').filter(li => li.classList.contains('era-tile'));

    it('gets its own "Future logo" tile first, and the current tile keeps the logo in use and "pres."', async () => {
      stub({ logoFolder: 'San Antonio', manifest: manifest(), extra: calendar(79) });
      renderFranchise();
      await screen.findByRole('heading', { level: 1 });
      const [future, current] = tiles();
      expect(future.classList.contains('future-logo')).toBe(true);
      expect(future.textContent).toContain('Future logo');
      expect(future.textContent).toContain('Starts S80');
      expect(within(future).getByRole('img').getAttribute('src')).toBe(logoUrl('San Antonio', 80));
      expect(current.textContent).toContain('S57–pres.');
      const imgs = within(current).getAllByRole('img');
      expect(imgs).toHaveLength(1);
      expect(imgs[0].getAttribute('src')).toBe(logoUrl('San Antonio', 57));
      // the hero still wears the logo in use
      expect(screen.getAllByRole('img').some(i => i.getAttribute('src') === logoUrl('San Antonio', 79))).toBe(true);
    });

    it('is the current logo once the season arrives: no Future tile, both logos in the era tile, hero switched', async () => {
      stub({ logoFolder: 'San Antonio', manifest: manifest(), extra: calendar(80) });
      renderFranchise();
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText('Future logo')).toBeNull();
      const era = tiles().find(li => li.textContent?.includes('S57–pres.'))!;
      expect(within(era).getAllByRole('img')).toHaveLength(2);
      expect(screen.getAllByRole('img').some(i => i.getAttribute('src') === logoUrl('San Antonio', 80))).toBe(true);
    });
  });

  it('reports an unknown franchise', async () => {
    stub();
    renderFranchise('ZZZ');
    expect((await screen.findByText('Unknown franchise "ZZZ".')).className).toBe('error');
  });

  it('shows the import hint, not a franchise, when franchises.json is missing', async () => {
    stub({ noFranchises: true });
    renderFranchise();
    expect(await screen.findByText(/No franchise history yet/)).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('shows an error, not an empty state, when the draft history fails to load', async () => {
    stub({ draftsFail: true });
    renderFranchise();
    expect((await screen.findByText(/Couldn't load the history/)).className).toBe('error');
  });

  describe('Players tab', () => {
    const extra = {
      '/api/state/leagues/fba/playerBios.json': { league: 'fba', bios: [{ playerId: 'p00001', born: 'Born-S40', entries: ['USA-S18-S22', 'S20 MVP'] }] },
    };
    const requested = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]));

    it('opens on Overview and does not load the bios', async () => {
      stub({ extra });
      renderFranchise();
      await screen.findByRole('heading', { level: 1 });
      expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe('true');
      expect(requested().some(u => u.includes('playerBios'))).toBe(false);
    });

    it('?tab=players lists the franchise players, and the tab buttons switch', async () => {
      stub({ extra });
      renderFranchise('SAS', '?tab=players');
      expect(await screen.findByRole('link', { name: 'Cameron Lučić' })).toBeTruthy();
      expect(screen.getByText(/S18–S22/)).toBeTruthy();
      expect(screen.getByText(/MVP \(S20\)/)).toBeTruthy();
      fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
      expect(await screen.findByRole('heading', { name: 'Championships' })).toBeTruthy();
    });
  });
});
