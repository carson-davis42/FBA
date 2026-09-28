// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { recordGames, simNextGames } from '../../engine/season/moves';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { TeamPage } from './TeamPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('team page season view', () => {
  it('shows PPG and the team schedule with results', async () => {
    const s = fbaSeasonState();
    const r = recordGames(s, simNextGames(s, 2, mulberry32(3)).games);
    if (!r.ok) throw new Error(r.problems.join('; '));
    stubApi(seasonDocs(r.state));
    const played = r.state.results!.games[0];
    render(
      <MemoryRouter initialEntries={[`/league/fba/team/${played.home}`]}>
        <Routes><Route path="/league/:league/team/:teamId" element={<TeamPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('PPG')).toBeTruthy();
    const sched = await screen.findByRole('table', { name: 'Schedule & results' });
    const rows = within(sched).getAllByRole('row').slice(1);
    const teamGames = r.state.schedule!.games.filter(g => g.home === played.home || g.away === played.home);
    expect(rows).toHaveLength(teamGames.length);
    expect(rows[0].textContent).toMatch(/^\d+(vs|@) [A-Z]+([WL] \d+-\d+|—)$/);
  });
});
