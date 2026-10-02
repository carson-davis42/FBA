// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JcSchoolHistoryFile, PlayersFile, SummaryFile, TeamsFile } from '../../../engine/shared/types';
import { JcAwardsHistoryPage } from './JcAwardsHistoryPage';
import { JcSchoolPage } from './JcSchoolPage';
import { JcSchoolsPage } from './JcSchoolsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = { nextId: 2, players: { p00001: { id: 'p00001', name: 'Rylan Rush', birthSeason: 40 } } };
const team = (teamId: string, name: string, group: string) => ({ teamId, name, abbr: teamId, group, logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } });
const teams: TeamsFile = { league: 'fbajc', teams: [team('UNC', 'North Carolina', 'ACC'), team('DUKE', 'Duke', 'ACC'), team('KU', 'Kansas', 'B12'), team('TTU', 'Texas Tech', 'B12')] } as TeamsFile;

const schoolHistory: JcSchoolHistoryFile = {
  league: 'fbajc', throughSeason: 78,
  schools: [{
    teamId: 'UNC',
    mm: { app: [1, 53, 75], sweet16: [53, 75], elite8: [75], final4: [75], titleGame: [75], champion: [75] },
    rsChampion: [{ season: 53, conf: 'B12' }, { season: 75, conf: null }],
    confTournament: [],
    mmWins: null,
  }],
};

const s1: SummaryFile = { league: 'fbajc', season: 1, locked: true, host: null, champions: [{ title: 'National Champion', champion: 'Duke', runnerUp: 'North Carolina', score: null, teamId: 'DUKE', runnerUpId: 'UNC' }] };
const s75: SummaryFile = {
  league: 'fbajc', season: 75, locked: true, host: null,
  champions: [
    { title: 'National Champion', champion: 'North Carolina', runnerUp: 'Duke', score: null, teamId: 'UNC', runnerUpId: 'DUKE' },
    { title: 'NIT Champion', champion: 'Kansas', runnerUp: 'Duke', score: null, teamId: 'KU', runnerUpId: 'DUKE' },
  ],
  jc: {
    confChampions: [],
    national: [{ award: 'POY', playerId: 'p00001', teamId: 'UNC', name: 'Rylan Rush', school: 'North Carolina' }],
    conference: [{ conf: 'ACC', playerId: null, teamId: 'DUKE', name: 'Mystery Man', school: 'Duke' }, { conf: 'B12', playerId: null, teamId: 'KU', name: 'Kansas Kid', school: 'Kansas' }],
    allAmerican: null,
    mvp: { mm: null, nit: null }, nit: { champion: 'KU', runnerUp: 'DUKE' },
  },
};

function stub(opts: { schools?: boolean } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fbajc') return new Response(JSON.stringify({ league: 'fbajc', seasons: [s1, s75], errors: [] }));
    if (url === '/api/state/players.json') return new Response(JSON.stringify(players), { headers: { ETag: '"0000000000000001"' } });
    if (url === '/api/state/leagues/fbajc/teams.json') return new Response(JSON.stringify(teams), { headers: { ETag: '"0000000000000002"' } });
    if (url === '/api/state/leagues/fbajc/schoolHistory.json' && opts.schools !== false) return new Response(JSON.stringify(schoolHistory), { headers: { ETag: '"0000000000000003"' } });
    return new Response('{}', { status: 404 });
  }));
}
const school = (id: string) => render(
  <MemoryRouter initialEntries={[`/history/fbajc/schools/${id}`]}><Routes><Route path="/history/fbajc/schools/:teamId" element={<JcSchoolPage />} /></Routes></MemoryRouter>,
);

describe('JcAwardsHistoryPage', () => {
  it('lists the national winners by season and switches the conference', async () => {
    stub();
    const { container } = render(<MemoryRouter><JcAwardsHistoryPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'College Awards' })).toBeTruthy();
    const nat = container.querySelector('table.stat-table')!;
    expect(within(nat as HTMLElement).getByRole('link', { name: 'Rylan Rush' }).getAttribute('href')).toBe('/history/fba/players/p00001');
    expect(nat.textContent).toContain('S75');
    const select = screen.getByRole('combobox', { name: 'Conference' }) as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(['ACC', 'Big 12']);
    expect(container.textContent).toContain('Mystery Man');
    fireEvent.change(select, { target: { value: 'B12' } });
    expect(container.textContent).toContain('Kansas Kid');
    expect(container.textContent).not.toContain('Mystery Man');
  });
});

describe('JcSchoolsPage', () => {
  it('groups the schools by conference with their title counts', async () => {
    stub();
    const { container } = render(<MemoryRouter><JcSchoolsPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'College Schools' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['ACC', 'Big 12']);
    const row = (name: string) => [...container.querySelectorAll('tbody tr')].find(tr => tr.textContent!.includes(name))!;
    const cells = (name: string) => [...row(name).querySelectorAll('td.n')].map(td => td.textContent);
    expect(cells('North Carolina')).toEqual(['1', '0', '2', '3']);
    expect(cells('Kansas')).toEqual(['0', '1', '0', '0']);
    expect(within(row('Duke') as HTMLElement).getByRole('link').getAttribute('href')).toBe('/history/fbajc/schools/DUKE');
  });
  it('says the school history is missing when its file is', async () => {
    stub({ schools: false });
    render(<MemoryRouter><JcSchoolsPage /></MemoryRouter>);
    expect(await screen.findByText(/imported school history isn't loaded/)).toBeTruthy();
  });
});

describe('JcSchoolPage', () => {
  it('shows a school with titles, its March Madness runs (the JC era labelled) and its players\' awards', async () => {
    stub();
    const { container } = school('UNC');
    expect(await screen.findByRole('heading', { name: 'North Carolina' })).toBeTruthy();
    const tiles = [...container.querySelectorAll('.stat-tile')].map(t => t.textContent);
    expect(tiles).toEqual(['1National titles', '1Runner-up', '0NIT titles', '3March Madness']);
    const mm = [...container.querySelectorAll('table.stat-table tbody tr')].map(tr => tr.textContent);
    expect(mm).toEqual(['S1 · FFL S46Appearance', 'S53Sweet 16', 'S75Champion']);
    expect(container.textContent).toContain('Conference regular season: S53 (Big 12), S75');
    expect(screen.getByRole('link', { name: 'Rylan Rush' }).getAttribute('href')).toBe('/history/fba/players/p00001');
    expect(screen.queryByText(/has no entry for this school/)).toBeNull();
    const hero = container.querySelector('section.hero-team') as HTMLElement;
    expect(hero.style.getPropertyValue('--team')).toBe('#112233');
  });

  it('shows what the summaries give for a school missing from the school history', async () => {
    stub();
    const { container } = school('DUKE');
    expect(await screen.findByRole('heading', { name: 'Duke' })).toBeTruthy();
    expect(screen.getByText(/has no entry for this school/)).toBeTruthy();
    expect([...container.querySelectorAll('.stat-tile')].map(t => t.textContent)).toEqual(['1National titles', '1Runner-up', '0NIT titles', '0March Madness']);
    expect(screen.getByText('No March Madness appearances recorded.')).toBeTruthy();
    expect(container.textContent).toContain('Mystery Man');
  });

  it('shows a school with no titles at all', async () => {
    stub();
    const { container } = school('TTU');
    expect(await screen.findByRole('heading', { name: 'Texas Tech' })).toBeTruthy();
    expect([...container.querySelectorAll('.stat-tile')].map(t => t.textContent)).toEqual(['0National titles', '0Runner-up', '0NIT titles', '0March Madness']);
    expect(container.textContent).not.toContain('Awards won by its players');
  });

  it('says Not found for an unknown school', async () => {
    stub();
    school('NOPE');
    expect(await screen.findByText('Not found')).toBeTruthy();
  });
});
