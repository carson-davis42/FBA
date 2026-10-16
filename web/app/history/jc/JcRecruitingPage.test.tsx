// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JcRecruitingHistoryFile, RecruitingFile, TeamsFile } from '../../../engine/shared/types';
import { JcRecruitingPage } from './JcRecruitingPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const teams: TeamsFile = { league: 'fbajc', teams: [{ teamId: 'DUKE', name: 'Duke', abbr: 'DUKE', group: 'ACC', logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } }] };
const file: JcRecruitingHistoryFile = {
  league: 'fbajc', throughSeason: 78,
  classes: [
    { season: 52, recruits: [{ rank: 1, stars: 5, pos: 'OUT', name: 'Old Timer', playerId: null, rating: null, consensus: null, school: 'Duke', teamId: 'DUKE' }], portal: [] },
    { season: 78, recruits: [{ rank: 1, stars: 5, pos: 'PG', name: 'Milo Lawrenz', playerId: 'p00001', rating: 94, consensus: 98.9, school: 'Duke', teamId: 'DUKE' }],
      portal: [{ rank: 1, pos: 'PF', name: 'Kobe Livingston', playerId: null, rating: 92, fromSchool: 'Duke', fromTeamId: 'DUKE', toSchool: 'Duke', toTeamId: 'DUKE' }] },
  ],
};

const liveBoard = (locked: boolean): RecruitingFile => ({
  league: 'fbajc', season: 78, classOf: 79, locked, classDraft: [], created: true,
  recruits: [{ playerId: 'p00001', position: 'SF', classYear: 'Fr', rating: 93, stars: 5, consensus: 98.1, projections: {}, committedTo: 'DUKE' }],
  portal: [],
});

function stub(has: boolean, board: RecruitingFile | null = null) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/state/leagues/fbajc/teams.json') return new Response(JSON.stringify(teams), { headers: { ETag: '"0000000000000001"' } });
    if (url === '/api/state/leagues/fbajc/recruitingHistory.json' && has) return new Response(JSON.stringify(file), { headers: { ETag: '"0000000000000001"' } });
    if (url === '/api/state/meta.json') return new Response(JSON.stringify({ currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 80, fbawc: 78 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 } }), { headers: { ETag: '"0000000000000001"' } });
    if (url === '/api/state/leagues/fbajc/S78/recruiting.json' && board) return new Response(JSON.stringify(board), { headers: { ETag: '"0000000000000001"' } });
    if (url === '/api/state/players.json') return new Response(JSON.stringify({ nextId: 2, players: { p00001: { id: 'p00001', name: 'Milo Lawrenz', birthSeason: null } } }), { headers: { ETag: '"0000000000000001"' } });
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }));
}
const at = () => render(<MemoryRouter initialEntries={['/history/fbajc/recruiting']}><JcRecruitingPage /></MemoryRouter>);

describe('JcRecruitingPage', () => {
  it('shows the latest class and portal, and switches class', async () => {
    stub(true);
    at();
    const table = await screen.findByRole('table', { name: 'Class of S78' });
    expect(within(table).getByText('Milo Lawrenz')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Transfer portal S78' }).textContent).toContain('Kobe Livingston');
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: '52' } });
    const old = await screen.findByRole('table', { name: 'Class of S52' });
    expect(within(old).getByText('Old Timer')).toBeTruthy();
    expect(within(old).queryByText('Rtg')).toBeNull();
  });
  it('adds the class the app ran after the import (a locked board) as the newest past class', async () => {
    stub(true, liveBoard(true));
    at();
    const table = await screen.findByRole('table', { name: 'Class of S79' });
    expect(within(table).getByText('Milo Lawrenz')).toBeTruthy();
    expect(within(table).getByText('Duke')).toBeTruthy();
    expect([...screen.getByLabelText('Class').querySelectorAll('option')].map(o => o.textContent)).toEqual(['S79', 'S78', 'S52']);
  });
  it('leaves out a board that is not locked yet', async () => {
    stub(true, liveBoard(false));
    at();
    await screen.findByRole('table', { name: 'Class of S78' });
    expect(screen.queryByRole('table', { name: 'Class of S79' })).toBeNull();
  });
  it('says so when nothing is imported', async () => {
    stub(false);
    at();
    expect(await screen.findByText(/haven't been imported yet/)).toBeTruthy();
  });
});
