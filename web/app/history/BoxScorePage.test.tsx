// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PastBracket } from '../../engine/shared/types';
import { BoxScorePage } from './BoxScorePage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const side = (name: string, seed: number | null, record: string | null = null) => ({ name, record, seed });
const bracket = (extra: Record<string, unknown> = {}): PastBracket => ({
  rounds: 2,
  series: [
    { id: 'R1-1', round: 1, home: side('San Antonio', 1, '60-20'), away: side('Montreal', 4), homeWins: 4, awayWins: 2, winner: 'home' },
    { id: 'R1-2', round: 1, home: side('Boston', 2), away: null, homeWins: 0, awayWins: 0, winner: 'home' },
    { id: 'R2-1', round: 2, home: side('San Antonio', 1), away: side('Boston', 2), homeWins: 0, awayWins: 0, winner: 'home', unscored: true },
    ...(extra.single ? [] : []),
  ],
});
const mkTeam = (teamId: string, name: string) => ({ teamId, name, abbr: teamId, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const players = { nextId: 4, players: { p00001: { id: 'p00001', name: 'Ann Able', birthSeason: 40 }, p00002: { id: 'p00002', name: 'Bo Baker', birthSeason: 40 }, p00003: { id: 'p00003', name: 'Cy Cole', birthSeason: 40 } } };
const bio = (playerId: string, ...entries: string[]) => ({ playerId, born: 'Born-S40', entries });
const bios = { league: 'fba', bios: [bio('p00001', 'USA-S18-S22', 'S20 MVP'), bio('p00002', 'MON-S18-S22', 'D2(Rome)-S23-S24', 'WC(Italy)-S23'), bio('p00003', 'D2(Rome)-S23-S24')] };
const franchises = {
  franchises: [
    { teamId: 'SAS', eras: [{ name: 'San Antonio', abbr: 'USA', city: 'San Antonio', from: 1, to: null }] },
    { teamId: 'MON', eras: [{ name: 'Montreal', abbr: 'MON', city: 'Montreal', from: 1, to: null }] },
  ],
};

function stub(docs: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url in docs ? new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } }) : new Response('{}', { status: 404 })));
}
const common = {
  '/api/state/players.json': players,
  '/api/state/leagues/fba/playerBios.json': bios,
};
const fba = (b: PastBracket) => ({
  ...common,
  '/api/state/leagues/fba/S20/summary.json': { league: 'fba', season: 20, locked: true, host: null, champions: [], pastBracket: b },
  '/api/state/leagues/fba/teams.json': { league: 'fba', teams: [mkTeam('SAS', 'San Antonio'), mkTeam('MON', 'Montreal')] },
  '/api/state/leagues/fba/franchises.json': franchises,
  '/api/state/leagues/fba/hallOfFame.json': { league: 'fba', classes: [], nominees: [], removed: [] },
});
const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/history/:league/season/:season/game/:seriesId" element={<BoxScorePage />} /></Routes>
  </MemoryRouter>,
);

describe('BoxScorePage', () => {
  it('shows a series result and each franchise\'s roster for that season', async () => {
    stub(fba(bracket()));
    renderAt('/history/fba/season/20/game/R1-1');
    expect(await screen.findByText(/Final Four/)).toBeTruthy();
    const bug = document.querySelector('.scorebug')!;
    expect(bug.querySelector('.away .score')!.textContent).toBe('2');
    expect(bug.querySelector('.home .score')!.textContent).toBe('4');
    expect(screen.getByRole('link', { name: 'Ann Able' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Bo Baker' })).toBeTruthy();
    expect(screen.getByText('MVP')).toBeTruthy();
    expect(screen.queryByText('Rtg')).toBeNull();
  });

  it('shows a dash for a series whose page printed only the winner', async () => {
    stub(fba(bracket()));
    renderAt('/history/fba/season/20/game/R2-1');
    await screen.findByText(/Championship/);
    expect(document.querySelector('.scorebug .away .score')!.textContent).toBe('—');
  });

  it('shows a single game\'s points, winner first, with its OT tag', async () => {
    const b = bracket();
    b.series[0] = { ...b.series[0], homeWins: 1, awayWins: 0, score: '97–75 OT' };
    stub(fba(b));
    renderAt('/history/fba/season/20/game/R1-1');
    await screen.findByText(/Final \(OT\)/);
    expect(document.querySelector('.scorebug .home .score')!.textContent).toBe('97');
    expect(document.querySelector('.scorebug .away .score')!.textContent).toBe('75');
  });

  it('builds a D2 roster from the bios by team name', async () => {
    const d2 = { league: 'fbad2', season: 24, locked: true, host: null, champions: [], pastBracket: { rounds: 1, series: [
      { id: 'R1-1', round: 1, home: side('Rome', 1), away: side('Hamburg', 2), homeWins: 3, awayWins: 1, winner: 'home' },
    ] } };
    stub({ ...common, '/api/state/leagues/fbad2/S24/summary.json': d2, '/api/state/leagues/fbad2/teams.json': { league: 'fbad2', teams: [mkTeam('ROME', 'Rome')] } });
    renderAt('/history/fbad2/season/24/game/R1-1');
    const rome = (await screen.findByText('Rome in S24')).closest('section')!;
    expect(within(rome).getByRole('link', { name: 'Bo Baker' })).toBeTruthy();
    expect(within(rome).getByRole('link', { name: 'Cy Cole' })).toBeTruthy();
    const hamburg = screen.getByText('Hamburg in S24').closest('section')!;
    expect(within(hamburg).getByText('No players recorded for this team and season.')).toBeTruthy();
  });

  it('says so for a bye, an unknown game and an unknown league', async () => {
    stub(fba(bracket()));
    renderAt('/history/fba/season/20/game/R1-2');
    expect(await screen.findByText('No such game.')).toBeTruthy();
    cleanup();
    renderAt('/history/nba/season/20/game/R1-1');
    expect(screen.getByText('Unknown game.')).toBeTruthy();
  });
});
