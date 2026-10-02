// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wcAppearances } from '../../../engine/history/wc';
import type { SummaryFile, Team, TeamsFile } from '../../../engine/shared/types';
import { WcTeamPage } from './WcTeamPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mk = (teamId: string, name: string): Team => ({ teamId, name, abbr: teamId, group: null, logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } });
const mex = mk('MEX', 'Mexico');
const teams: TeamsFile = { league: 'fbawc', teams: [mex, mk('GER', 'Germany'), mk('ITA', 'Italy')] };
const side = (name: string) => ({ name, record: null, seed: null });
const ser = (id: string, round: number, h: string, a: string, winner: 'home' | 'away') => ({ id, round, home: side(h), away: side(a), homeWins: winner === 'home' ? 1 : 0, awayWins: winner === 'away' ? 1 : 0, winner });
const sums: SummaryFile[] = [
  { league: 'fbawc', season: 76, locked: true, host: 'Spain', champions: [{ title: 'World Cup Champion', champion: 'Mexico', runnerUp: 'Italy', score: null, teamId: 'MEX', runnerUpId: 'ITA' }] },
  { league: 'fbawc', season: 78, locked: true, host: 'Croatia', champions: [{ title: 'World Cup Champion', champion: 'Germany', runnerUp: 'Italy', score: null, teamId: 'GER', runnerUpId: 'ITA' }],
    pastBracket: { rounds: 3, series: [ser('R1-1', 1, 'Mexico', 'Peru', 'away'), ser('R1-2', 1, 'Germany', 'Brazil', 'home'), ser('R2-1', 2, 'Peru', 'Germany', 'away'), ser('R3-1', 3, 'Germany', 'Italy', 'home')] } },
];

describe('wcAppearances', () => {
  it('lists titles, finals and how far a country went in a bracket, newest first', () => {
    expect(wcAppearances(mex, sums)).toEqual([{ season: 78, host: 'Croatia', result: 'Quarter-final' }, { season: 76, host: 'Spain', result: 'Champion' }]);
  });
});

describe('WcTeamPage', () => {
  it('shows the country, its World Cups and a link to each season', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/history/fbawc') return new Response(JSON.stringify({ league: 'fbawc', seasons: sums, errors: [] }));
      if (url === '/api/state/leagues/fbawc/teams.json') return new Response(JSON.stringify(teams), { headers: { ETag: '"0000000000000001"' } });
      return new Response('{}', { status: 404 });
    }));
    render(<MemoryRouter initialEntries={['/history/fbawc/teams/MEX']}><Routes><Route path="/history/fbawc/teams/:teamId" element={<WcTeamPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Mexico' })).toBeTruthy();
    expect(screen.getByText('Champion')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'S76' }).getAttribute('href')).toBe('/history/fbawc/season/76');
    expect(screen.getByText(/2 World Cups on record · 1 title \(S76\)/)).toBeTruthy();
  });
});
