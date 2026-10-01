// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PastBracket, PlayersFile, SummaryFile, TeamsFile } from '../../../engine/shared/types';
import { JcChampionshipsPage } from './JcChampionshipsPage';
import { JcSeasonPage } from './JcSeasonPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = {
  nextId: 3,
  players: {
    p00001: { id: 'p00001', name: 'Rylan Rush', birthSeason: 40 },
    p00002: { id: 'p00002', name: 'Jaime Snow', birthSeason: 41 },
  },
};
const team = (teamId: string, name: string, group: string) => ({ teamId, name, abbr: teamId, group, logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } });
const teams: TeamsFile = { league: 'fbajc', teams: [team('UNC', 'North Carolina', 'ACC'), team('DUKE', 'Duke', 'ACC'), team('KU', 'Kansas', 'B12'), team('FSU', 'Florida State', 'ACC')] } as TeamsFile;

const side = (name: string, record: string | null, seed: number | null = null) => ({ name, record, seed });
const bracket: PastBracket = {
  rounds: 1,
  series: [{ id: 'R1-1', round: 1, home: side('North Carolina', '20-2', 1), away: side('Duke', '19-3', 2), homeWins: 1, awayWins: 0, winner: 'home', score: '52–47 OT' }],
};

const s1: SummaryFile = { league: 'fbajc', season: 1, locked: true, host: null, champions: [{ title: 'National Champion', champion: 'Duke', runnerUp: 'Virginia', score: null, teamId: 'DUKE' }] };
const s53: SummaryFile = {
  league: 'fbajc', season: 53, locked: true, host: null,
  champions: [{ title: 'National Champion', champion: 'Duke', runnerUp: 'Kansas', score: null, teamId: 'DUKE', runnerUpId: 'KU' }],
  jc: {
    confChampions: [{ conf: 'B12', tournament: 'KU', regularSeason: ['KU', 'Texas Tech'], regularSeasonRecords: ['12-3', null] }],
    national: [{ award: 'POY', playerId: 'p00002', teamId: 'FSU', name: 'Jaime Snow', school: 'Florida State' }],
    conference: [{ conf: 'ACC', playerId: null, teamId: null, name: 'Mystery Man', school: 'Duke' }],
    allAmerican: null,
    allAmericanLegacy: { teams: [{ team: 1, slots: [{ slot: 'OUT', name: 'Jaime Snow', school: 'Florida State', playerId: 'p00002', teamId: 'FSU' }, { slot: 'MID', name: 'Nobody Known', school: null, playerId: null }] }] },
    mvp: { mm: null, nit: null },
    nit: null,
  },
};
const s75: SummaryFile = {
  league: 'fbajc', season: 75, locked: true, host: null,
  champions: [
    { title: 'National Champion', champion: 'North Carolina', runnerUp: 'Duke', score: '52-47', teamId: 'UNC', runnerUpId: 'DUKE', finalsMvp: 'p00001' },
    { title: 'NIT Champion', champion: 'Kansas', runnerUp: 'Florida State', score: null, teamId: 'KU', runnerUpId: 'FSU', finalsMvp: null, mvpName: 'Out Of Roster' },
  ],
  pastBracket: bracket,
  jc: {
    confChampions: [],
    national: [],
    conference: [],
    allAmerican: [1, 2, 3].map(t => ({ team: t as 1 | 2 | 3, slots: (['G', 'F', 'C', 'ANY', 'ANY'] as const).map((slot, i) => ({ slot, playerId: t === 1 && i === 0 ? 'p00001' : null, teamId: 'UNC', name: t === 1 && i === 0 ? 'Rylan Rush' : `Player ${t}${i}`, school: 'North Carolina' })) })),
    mvp: { mm: 'p00001', nit: null },
    nit: { champion: 'KU', runnerUp: 'FSU' },
    nitBracket: { rounds: 1, series: [{ id: 'R1-1', round: 1, home: side('Kansas', '18-9'), away: side('Florida State', '17-10'), homeWins: 0, awayWins: 0, winner: 'home', unscored: true }] },
  },
};

function stub(seasons: SummaryFile[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fbajc') return new Response(JSON.stringify({ league: 'fbajc', seasons, errors: [] }));
    if (url === '/api/state/players.json') return new Response(JSON.stringify(players), { headers: { ETag: '"0000000000000001"' } });
    if (url === '/api/state/leagues/fbajc/teams.json') return new Response(JSON.stringify(teams), { headers: { ETag: '"0000000000000002"' } });
    return new Response('{}', { status: 404 });
  }));
}
const season = (n: string) => render(
  <MemoryRouter initialEntries={[`/history/fbajc/season/${n}`]}><Routes><Route path="/history/fbajc/season/:season" element={<JcSeasonPage />} /></Routes></MemoryRouter>,
);

describe('JcChampionshipsPage', () => {
  it('lists the national and NIT champions newest first, and the title counts', async () => {
    stub([s1, s53, s75]);
    const { container } = render(<MemoryRouter><JcChampionshipsPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'College Championships' })).toBeTruthy();
    await screen.findAllByRole('listitem');
    const rows = [...container.querySelectorAll<HTMLElement>('.timeline-row')];
    expect(rows.map(r => r.querySelector('.timeline-season')!.textContent)).toEqual(['S75', 'S53', 'S1 · FFL S46']);
    expect(rows[0].textContent).toContain('NIT Champion');
    expect(rows[0].textContent).toContain('52–47');
    expect(within(rows[0]).getByRole('link', { name: 'Rylan Rush' }).getAttribute('href')).toBe('/history/fba/players/p00001');
    expect(rows[0].textContent).toContain('Out Of Roster');
    expect(within(rows[0]).getAllByRole('link', { name: 'North Carolina' })[0].getAttribute('href')).toBe('/history/fbajc/schools/UNC');
    expect(rows[2].textContent).toContain('Virginia');
    const counts = [...container.querySelectorAll('table.stat-table tbody tr')].map(tr => tr.textContent);
    expect(counts.find(t => t!.includes('Duke'))).toMatch(/Duke2S1, S53/);
  });
  it('says so when there are no championships', async () => {
    stub([]);
    render(<MemoryRouter><JcChampionshipsPage /></MemoryRouter>);
    expect(await screen.findByText('No championships recorded yet.')).toBeTruthy();
  });
});

describe('JcSeasonPage', () => {
  it('S1 shows the champion only, labelled with its FFL season, and no bracket', async () => {
    stub([s1, s53, s75]);
    season('1');
    expect(await screen.findByRole('heading', { name: /S1 · FFL S46 college season/ })).toBeTruthy();
    expect(screen.getByText('National Champion')).toBeTruthy();
    expect(screen.getByText(/over Virginia/)).toBeTruthy();
    expect(screen.queryByText('All-Americans')).toBeNull();
    expect(screen.queryByText('Conference champions')).toBeNull();
    expect(screen.getByText('No bracket recorded')).toBeTruthy();
    expect(screen.queryByText('NIT')).toBeNull();
  });

  it('S53 shows the legacy All-American slots as written, awards, conference champions with records', async () => {
    stub([s1, s53, s75]);
    const { container } = season('53');
    expect(await screen.findByRole('heading', { name: /S53 college season/ })).toBeTruthy();
    const aa = screen.getByRole('heading', { name: 'All-Americans' }).parentElement!;
    expect(within(aa).getByText('OUT')).toBeTruthy();
    expect(within(aa).getByText('MID')).toBeTruthy();
    expect(within(aa).getByRole('link', { name: 'Jaime Snow' }).getAttribute('href')).toBe('/history/fba/players/p00002');
    expect(within(aa).getByText('Nobody Known')).toBeTruthy();
    expect(screen.getByText(/Trae York Player of the Year/)).toBeTruthy();
    expect(screen.getByText(/Mystery Man/)).toBeTruthy();
    const conf = container.querySelector('table.stat-table')!;
    expect(conf.textContent).toContain('Big 12');
    expect(conf.textContent).toContain('(12-3)');
    expect(conf.textContent).toContain('Texas Tech');
    expect(screen.getByText('No bracket recorded')).toBeTruthy();
  });

  it('S75 shows the current All-American shape, both brackets and the NIT champion', async () => {
    stub([s1, s53, s75]);
    const { container } = season('75');
    expect(await screen.findByRole('heading', { name: /S75 college season/ })).toBeTruthy();
    const aa = screen.getByRole('heading', { name: 'All-Americans' }).parentElement!;
    expect(within(aa).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Team 1', 'Team 2', 'Team 3']);
    expect(within(aa).getAllByText('ANY')).toHaveLength(6);
    expect(container.querySelectorAll('.bracket')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'March Madness' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'NIT' })).toBeTruthy();
    expect(screen.getByText('OT')).toBeTruthy();
    expect(screen.queryByText('No bracket recorded')).toBeNull();
  });

  it('says Not found for a season that does not exist, and offers neighbouring seasons otherwise', async () => {
    stub([s1, s53, s75]);
    season('40');
    expect(await screen.findByText('Not found')).toBeTruthy();
    cleanup();
    stub([s1, s53, s75]);
    season('53');
    await screen.findByRole('heading', { name: /S53 college season/ });
    expect(screen.getByRole('link', { name: '← S1' }).getAttribute('href')).toBe('/history/fbajc/season/1');
    expect(screen.getByRole('link', { name: 'S75 →' }).getAttribute('href')).toBe('/history/fbajc/season/75');
  });
});
