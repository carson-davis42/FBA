// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayersFile, SummaryFile, TeamsFile, WcHostsFile } from '../../../engine/shared/types';
import { buildWcSummary } from '../../../engine/wc/summary';
import { runFullWorldCup } from '../../../engine/wc/testRun';
import { WcSeasonPage } from './WcSeasonPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players: PlayersFile = { nextId: 2, players: { p1: { id: 'p1', name: 'Rowan Hawthorne', birthSeason: 40 } } };
const teams: TeamsFile = {
  league: 'fbawc',
  teams: [
    { teamId: 'GER', name: 'Germany', abbr: 'GER', group: 'WC', logoFolder: null, badge: { bg: '#000000', fg: '#ffffff' }, flag: 'de' },
    { teamId: 'ITA', name: 'Italy', abbr: 'ITA', group: 'WC', logoFolder: null, badge: { bg: '#0000ff', fg: '#ffffff' }, flag: 'it' },
  ],
};
const hosts: WcHostsFile = { hosts: [{ season: 78, city: 'Zagreb', country: 'Croatia' }, { season: 80, city: 'Mumbai', country: 'India' }] };
const side = (name: string, seed: number) => ({ name, record: null, seed });
const pastBracket = { rounds: 1, series: [{ id: 'R1-1', round: 1, home: side('Germany', 1), away: side('Italy', 2), homeWins: 4, awayWins: 2, winner: 'home' as const }] };
const seasons: SummaryFile[] = [
  { league: 'fbawc', season: 78, locked: true, host: 'Croatia', champions: [{ title: 'World Cup Champion', champion: 'Germany', runnerUp: 'Italy', score: null, teamId: 'GER', runnerUpId: 'ITA', finalsMvp: 'p1' }], pastBracket },
  { league: 'fbawc', season: 77, locked: true, host: 'India', champions: [{ title: 'World Cup Champion', champion: 'Italy', runnerUp: 'Germany', score: null, teamId: 'ITA', runnerUpId: 'GER', finalsMvp: null, mvpName: 'Italy PG' }] },
];

function stub() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/history/fbawc') return new Response(JSON.stringify({ seasons, errors: [] }));
    if (url === '/api/state/players.json') return new Response(JSON.stringify(players), { headers: { ETag: '"0000000000000001"' } });
    if (url === '/api/state/leagues/fbawc/teams.json') return new Response(JSON.stringify(teams), { headers: { ETag: '"0000000000000002"' } });
    if (url === '/api/state/leagues/fbawc/hosts.json') return new Response(JSON.stringify(hosts), { headers: { ETag: '"0000000000000003"' } });
    return new Response('{}', { status: 404 });
  }));
}
const renderAt = (n: string) => render(
  <MemoryRouter initialEntries={[`/history/fbawc/season/${n}`]}>
    <Routes><Route path="/history/fbawc/season/:season" element={<WcSeasonPage />} /></Routes>
  </MemoryRouter>,
);

describe('World Cup season page', () => {
  it('shows host, champion, runner-up, MVP and the bracket', async () => {
    stub();
    renderAt('78');
    expect(await screen.findByRole('heading', { name: 'S78 World Cup' })).toBeTruthy();
    expect(await screen.findByText(/Zagreb, Croatia/)).toBeTruthy();
    const facts = (await screen.findByText('Tournament MVP')).closest('ul') as HTMLElement;
    expect(facts.textContent).toContain('Germany');
    expect(facts.textContent).toContain('Italy');
    expect(facts.textContent).toContain('Rowan Hawthorne');
    const bracket = document.querySelector('.bracket') as HTMLElement;
    expect(bracket.textContent).toContain('GER');
    expect(bracket.textContent).toContain('ITA');
  });

  it('shows a generated MVP as plain text and no bracket message', async () => {
    stub();
    renderAt('77');
    expect(await screen.findByText('Italy PG')).toBeTruthy();
    expect(screen.queryAllByRole('link', { name: 'Italy PG' })).toHaveLength(0);
    expect(screen.getByText('No bracket recorded')).toBeTruthy();
  });

  it('renders the bracket of a summary built from a finished World Cup', async () => {
    const wc = runFullWorldCup(79).w.worldCup!;
    const built = buildWcSummary(wc, { player: id => id, team: id => id }, { key: 'p1', name: 'Rowan Hawthorne', teamId: wc.champion!, generated: false, gp: 5, ppg: 20 }, null);
    seasons.push({ ...built, season: 79 });
    stub();
    renderAt('79');
    await screen.findByRole('heading', { name: 'S79 World Cup' });
    await screen.findByText('Tournament MVP');
    expect(document.querySelectorAll('.col-head')).toHaveLength(5);
    expect(document.querySelector('.cols-col')!.querySelectorAll('.series-box:not(.empty)')).toHaveLength(16);
    seasons.pop();
  });

  it('says Not found for an unknown season', async () => {
    stub();
    renderAt('5');
    expect(await screen.findByText('Not found')).toBeTruthy();
  });

  it('says Not played yet for an upcoming host', async () => {
    stub();
    renderAt('80');
    expect(await screen.findByText('Not played yet')).toBeTruthy();
    expect(screen.getByText(/Mumbai, India/)).toBeTruthy();
  });
});
