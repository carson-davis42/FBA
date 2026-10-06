// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerBiosFile, PlayersFile, SummaryFile, TeamsFile } from '../../engine/shared/types';
import { FBA_EMBLEM, HOF_EMBLEM } from './PlayerEmblem';
import { PlayerHistoryPage } from './PlayerHistoryPage';
import { logoUrl } from '../components/logoUrl';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const badge = { bg: '#112233', fg: '#ffffff' };
const team = (teamId: string, name: string, group: string | null, extra = {}) => ({ teamId, name, abbr: teamId, group, logoFolder: null, badge, ...extra });
const fbaTeams = { league: 'fba', teams: [team('TOR', 'Toronto Wolves', 'E'), team('VEG', 'Las Vegas Aces', 'W'), team('CP', 'Columbus Pirates', 'E'), team('TEX', 'Texas Outlaws', 'W')] } as TeamsFile;
const franchises = { franchises: [
  { teamId: 'CP', eras: [{ name: 'Former Pirates', abbr: 'FP', city: 'Former', from: 1, to: 34 }, { name: 'Columbus Pirates', abbr: 'CP', city: 'Columbus', from: 35, to: null }] },
  { teamId: 'TEX', eras: [{ name: 'Texas Outlaws', abbr: 'TEX', city: 'Texas', from: 30, to: null }] },
] };
const d2Teams = { league: 'fbad2', teams: [team('AUS', 'Austin', 'PL')] } as TeamsFile;
const jcTeams = { league: 'fbajc', teams: [
  team('ARMY', 'Army', 'PAT', { logoFolder: 'FBAJC_Final', logoFile: 'Army.png' }),
  team('OSU', 'Ohio State', 'B10', { logoFolder: 'FBAJC_Final', logoFile: 'Ohio State.png' }),
] } as TeamsFile;

const person = (n: number, name: string, retired = false) => [`p0000${n}`, { id: `p0000${n}`, name, birthSeason: 52, ...(retired ? { retired: { season: 78, league: 'fba', teamId: 'TOR', position: 'PG' } } : {}) }];
const players = { nextId: 9, players: Object.fromEntries([
  person(1, 'Andre Active'), person(2, 'Rita Retired', true), person(3, 'Hank Hall'), person(4, 'Colin College'), person(5, 'Dee Dee'), person(6, 'Old Timer'),
]) } as unknown as PlayersFile;
const bio = (n: number, entries: string[]) => ({ playerId: `p0000${n}`, born: 'Born-S52', entries });
const bios: PlayerBiosFile = { league: 'fba', bios: [
  bio(1, ['Army-S70', 'Ohio State-S71-S73', 'D2(Austin)-S74', 'TOR-S75-S76', 'VEG-S77-pres.']),
  bio(2, ['Army-S60', 'TOR-S61-S70']),
  bio(3, ['Army-S50', 'TOR-S51-S60', 'HOF-S66']),
  bio(4, ['Army-S77-S78']),
  bio(5, ['Ohio State-S76', 'D2(Austin)-S77-pres.']),
  bio(6, ['FP-S1-S19']),
] };
const s78: SummaryFile = { league: 'fba', season: 78, locked: true, host: null, champions: [] };

function stub(extra: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fba') return new Response(JSON.stringify(extra[url] ?? { seasons: [s78], errors: [] }));
    if (url === '/api/history/fbad2') return new Response(JSON.stringify({ seasons: [], errors: [] }));
    const docs: Record<string, unknown> = {
      '/api/state/players.json': players, '/api/state/leagues/fba/playerBios.json': bios, '/api/state/leagues/fba/teams.json': fbaTeams, '/api/state/leagues/fba/franchises.json': franchises,
      '/api/state/leagues/fbad2/teams.json': d2Teams, '/api/state/leagues/fbajc/teams.json': jcTeams, ...extra,
    };
    return url in docs ? new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } }) : new Response('{}', { status: 404 });
  }));
}
const open = async (id: string, extra: Record<string, unknown> = {}) => {
  stub(extra);
  const view = render(<MemoryRouter initialEntries={[`/history/fba/players/${id}`]}><Routes><Route path="/history/fba/players/:playerId" element={<PlayerHistoryPage />} /></Routes></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Career' });
  return view.container;
};
const heroSrc = (c: HTMLElement) => c.querySelector('.hero-logo img')?.getAttribute('src') ?? null;

const meta = { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } };
const entry = (playerId: string) => ({ position: 'PG', playerId, age: 27, rating: 80, contractEnd: 81, contractAmount: 5 });

describe('player page follows the live rosters', () => {
  it.each([79, 80])('uses S%s logos for the banner and ongoing stint even when the latest stats are S78', async currentSeason => {
    const c = await open('p00001', {
      '/api/state/meta.json': { ...meta, currentSeason, rosterSeason: { ...meta.rosterSeason, fba: currentSeason } },
      [`/api/state/leagues/fba/S${currentSeason}/rosters.json`]: { league: 'fba', season: currentSeason, locked: false, teams: { VEG: [entry('p00001')] } },
      '/api/state/leagues/fba/teams.json': { ...fbaTeams, teams: fbaTeams.teams.map(t => ({ ...t, logoFolder: t.name })) },
      '/api/history/fba': { seasons: [{ ...s78, legacyPpg: [{ playerId: 'p00001', teamId: 'VEG', ppg: 20 }] }], errors: [] },
    });
    expect(heroSrc(c)).toBe(logoUrl('Las Vegas Aces', currentSeason));
    const careerTable = c.querySelector('table.stat-table')!;
    const ongoing = within(careerTable as HTMLElement).getByRole('link', { name: /VEG$/ });
    expect(ongoing.querySelector('img')!.getAttribute('src')).toBe(logoUrl('Las Vegas Aces', currentSeason));
    const historical = within(careerTable as HTMLElement).getByRole('link', { name: /TOR$/ });
    expect(historical.querySelector('img')!.getAttribute('src')).toBe(logoUrl('Toronto Wolves', 75));
  });

  it('shows the team he signed with in the offseason: a new open stint, the banner and the logo', async () => {
    const c = await open('p00001', {
      '/api/state/meta.json': meta,
      '/api/state/leagues/fba/S79/rosters.json': { league: 'fba', season: 79, locked: false, teams: { TOR: [entry('p00001')], VEG: [] } },
    });
    const rows = [...c.querySelectorAll('table.stat-table tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent));
    expect(rows.slice(-2)).toEqual([['FBA', 'VEGVEG', 'S77-S78', ''], ['FBA', 'TORTOR', 'S79-pres.', '']]);
    expect(c.querySelector('.hero-logo .team-badge')!.textContent).toBe('TOR');
  });

  it('keeps the team he is still with, and a released player stays as he was', async () => {
    const same = await open('p00001', {
      '/api/state/meta.json': meta,
      '/api/state/leagues/fba/S79/rosters.json': { league: 'fba', season: 79, locked: false, teams: { VEG: [entry('p00001')] } },
    });
    expect([...same.querySelectorAll('table.stat-table tbody tr')].pop()!.textContent).toContain('S77-pres.');
    cleanup();
    const released = await open('p00001', { '/api/state/meta.json': meta, '/api/state/leagues/fba/S79/rosters.json': { league: 'fba', season: 79, locked: false, teams: { VEG: [] } } });
    expect([...released.querySelectorAll('table.stat-table tbody tr')].pop()!.textContent).toContain('S77-pres.');
  });

  it('puts a player found on a D2 roster in D2', async () => {
    const c = await open('p00001', {
      '/api/state/meta.json': meta,
      '/api/state/leagues/fbad2/S79/rosters.json': { league: 'fbad2', season: 79, locked: false, teams: { AUS: [entry('p00001')] } },
    });
    expect([...c.querySelectorAll('table.stat-table tbody tr')].pop()!.textContent).toContain('S79-pres.');
    expect(c.querySelector('.hero-logo .team-badge')!.textContent).toBe('AUS');
  });
});

describe('player page career and emblem', () => {
  it('reads a school spelled differently in a bio (case, "Lousiville") and still links it', async () => {
    const { findSchool } = await import('./CareerSection');
    expect(findSchool(jcTeams.teams, 'ohio state')?.teamId).toBe('OSU');
    expect(findSchool([{ ...jcTeams.teams[0], name: 'Louisville' }], 'Lousiville')).toBeDefined();
    expect(findSchool(jcTeams.teams, 'Nowhere U')).toBeUndefined();
  });

  it('links an old era abbreviation to its franchise and shows that era\'s name', async () => {
    const c = await open('p00006');
    const link = within(c.querySelector('table.stat-table') as HTMLElement).getByRole('link');
    expect(link.getAttribute('href')).toBe('/history/fba/teams/CP');
    expect(link.textContent).toContain('FP');
    expect(link.getAttribute('title')).toBe('Former Pirates');
    expect(heroSrc(c)).toContain('/logos/FBA/');
  });

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
    expect(heroSrc(c)).toBe(logoUrl(FBA_EMBLEM.logoFolder!, 79, FBA_EMBLEM.logoFile));
    expect(c.querySelector('.hero-kicker')!.textContent).toBe('S60–S70');
  });

  it('shows the gold FBA logo for a Hall of Famer, even if he is retired too', async () => {
    const c = await open('p00003');
    expect(heroSrc(c)).toBe(logoUrl(HOF_EMBLEM.logoFolder!, 79, HOF_EMBLEM.logoFile));
    expect(HOF_EMBLEM.logoFolder).toBe('FBA_Gold');
  });

  it('shows the school logo for a player still in college', async () => {
    const c = await open('p00004');
    expect(heroSrc(c)).toBe(logoUrl('FBAJC_Final', 79, 'Army.png'));
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
