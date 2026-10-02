// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerBiosFile, PlayersFile, SummaryFile, TeamsFile } from '../../engine/shared/types';
import { FBA_EMBLEM, HOF_EMBLEM } from './PlayerEmblem';
import { PlayerHistoryPage } from './PlayerHistoryPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const badge = { bg: '#112233', fg: '#ffffff' };
const team = (teamId: string, name: string, group: string | null, extra = {}) => ({ teamId, name, abbr: teamId, group, logoFolder: null, badge, ...extra });
const fbaTeams = { league: 'fba', teams: [team('TOR', 'Toronto Wolves', 'E'), team('VEG', 'Las Vegas Aces', 'W')] } as TeamsFile;
const d2Teams = { league: 'fbad2', teams: [team('AUS', 'Austin', 'PL')] } as TeamsFile;
const jcTeams = { league: 'fbajc', teams: [
  team('ARMY', 'Army', 'PAT', { logoFolder: 'FBAJC_Final', logoFile: 'Army.png' }),
  team('OSU', 'Ohio State', 'B10', { logoFolder: 'FBAJC_Final', logoFile: 'Ohio State.png' }),
] } as TeamsFile;

const person = (n: number, name: string, retired = false) => [`p0000${n}`, { id: `p0000${n}`, name, birthSeason: 52, ...(retired ? { retired: { season: 78, league: 'fba', teamId: 'TOR', position: 'PG' } } : {}) }];
const players = { nextId: 9, players: Object.fromEntries([
  person(1, 'Andre Active'), person(2, 'Rita Retired', true), person(3, 'Hank Hall'), person(4, 'Colin College'), person(5, 'Dee Dee'),
]) } as unknown as PlayersFile;
const bio = (n: number, entries: string[]) => ({ playerId: `p0000${n}`, born: 'Born-S52', entries });
const bios: PlayerBiosFile = { league: 'fba', bios: [
  bio(1, ['Army-S70', 'Ohio State-S71-S73', 'D2(Austin)-S74', 'TOR-S75-S76', 'VEG-S77-pres.']),
  bio(2, ['Army-S60', 'TOR-S61-S70']),
  bio(3, ['Army-S50', 'TOR-S51-S60', 'HOF-S66']),
  bio(4, ['Army-S77-S78']),
  bio(5, ['Ohio State-S76', 'D2(Austin)-S77-pres.']),
] };
const s78: SummaryFile = { league: 'fba', season: 78, locked: true, host: null, champions: [] };

function stub() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fba') return new Response(JSON.stringify({ seasons: [s78], errors: [] }));
    if (url === '/api/history/fbad2') return new Response(JSON.stringify({ seasons: [], errors: [] }));
    const docs: Record<string, unknown> = {
      '/api/state/players.json': players, '/api/state/leagues/fba/playerBios.json': bios, '/api/state/leagues/fba/teams.json': fbaTeams,
      '/api/state/leagues/fbad2/teams.json': d2Teams, '/api/state/leagues/fbajc/teams.json': jcTeams,
    };
    return url in docs ? new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } }) : new Response('{}', { status: 404 });
  }));
}
const open = async (id: string) => {
  stub();
  const view = render(<MemoryRouter initialEntries={[`/history/fba/players/${id}`]}><Routes><Route path="/history/fba/players/:playerId" element={<PlayerHistoryPage />} /></Routes></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Career' });
  return view.container;
};
const heroSrc = (c: HTMLElement) => c.querySelector('.hero-logo img')?.getAttribute('src') ?? null;

describe('player page career and emblem', () => {
  it('lists the college years as ordinary rows, links every team, and counts them in the years under the name', async () => {
    const c = await open('p00001');
    expect(c.querySelector('.hero-kicker')!.textContent).toBe('S70–pres.');
    const rows = [...c.querySelectorAll('table.stat-table tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent));
    // A team without a logo shows its badge text before the name.
    expect(rows).toEqual([['College', 'Army', 'S70', ''], ['College', 'Ohio State', 'S71-S73', ''], ['D2', 'AUSAustin', 'S74', ''], ['FBA', 'TORTOR', 'S75-S76', ''], ['FBA', 'VEG' + 'VEG', 'S77-pres.', '']]);
    const table = within(c.querySelector('table.stat-table') as HTMLElement);
    expect(table.getByRole('link', { name: /Army$/ }).getAttribute('href')).toBe('/history/fbajc/schools/ARMY');
    expect(table.getByRole('link', { name: /Ohio State$/ }).getAttribute('href')).toBe('/history/fbajc/schools/OSU');
    expect(table.getByRole('link', { name: /Austin$/ }).getAttribute('href')).toBe('/history/fbad2/teams/AUS');
    expect(table.getByRole('link', { name: /TOR$/ }).getAttribute('href')).toBe('/history/fba/teams/TOR');
    expect(table.getByRole('link', { name: /VEG$/ }).getAttribute('href')).toBe('/history/fba/teams/VEG');
    expect(c.querySelector('p')?.textContent ?? '').not.toContain('College:');
  });

  it('shows the FBA logo for a retired player', async () => {
    const c = await open('p00002');
    expect(heroSrc(c)).toBe(`/logos/${FBA_EMBLEM.logoFolder}/79?file=${encodeURIComponent(FBA_EMBLEM.logoFile!)}`);
    expect(c.querySelector('.hero-kicker')!.textContent).toBe('S60–S70');
  });

  it('shows the gold FBA logo for a Hall of Famer, even if he is retired too', async () => {
    const c = await open('p00003');
    expect(heroSrc(c)).toBe(`/logos/${HOF_EMBLEM.logoFolder}/79?file=${encodeURIComponent(HOF_EMBLEM.logoFile!)}`);
    expect(HOF_EMBLEM.logoFolder).toBe('FBA_Gold');
  });

  it('shows the school logo for a player still in college', async () => {
    const c = await open('p00004');
    expect(heroSrc(c)).toBe('/logos/FBAJC_Final/79?file=Army.png');
    expect(c.querySelector('.hero')!.getAttribute('style')).toContain('#112233');
  });

  it('shows the D2 team mark for a player in D2', async () => {
    const c = await open('p00005');
    expect(heroSrc(c)).toBeNull();
    expect(c.querySelector('.hero-logo .team-badge')!.textContent).toBe('AUS');
  });

  it('shows his current FBA team for an active pro', async () => {
    const c = await open('p00001');
    expect(c.querySelector('.hero-logo .team-badge')!.textContent).toBe('VEG');
  });
});
