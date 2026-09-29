// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullD2State } from '../../engine/playoffs/testFixtures';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import { calendarFor } from '../../engine/shared/calendar';
import { META, stubApi } from '../d2/testDocs';
import { NextSeasonPage } from './NextSeasonPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function readyDocs(): Record<string, unknown> {
  const d2 = fullD2State();
  const fba = fbaSeasonState();
  const cal = calendarFor(79);
  return {
    'meta.json': META,
    'calendar.json': { ...cal, steps: cal.steps.map(s => ({ ...s, done: true })) },
    'leagues/fbad2/teams.json': d2.teams,
    'leagues/fba/S79/rosters.json': fba.rosters,
    'leagues/fba/S79/transactions.json': fba.tx,
    'leagues/fba/S79/summary.json': { league: 'fba', season: 79, locked: true, host: null, champions: [] },
    'leagues/fbad2/S79/rosters.json': d2.rosters,
    'leagues/fbad2/S79/transactions.json': d2.tx,
    'leagues/fbad2/S79/summary.json': {
      league: 'fbad2', season: 79, locked: true, host: null, champions: [],
      promotion: [
        { league: 'PL', promoted: [], relegated: ['PL15', 'PL16'] },
        { league: 'WL', promoted: ['WL01', 'WL02'], relegated: [] },
        { league: 'UL', promoted: [], relegated: [] },
        { league: 'IL', promoted: [], relegated: [] },
      ],
    },
  };
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/next-season']}>
    <Routes>
      <Route path="/next-season" element={<NextSeasonPage />} />
      <Route path="/" element={<p>Home page</p>} />
    </Routes>
  </MemoryRouter>,
);

describe('NextSeasonPage', () => {
  it('lists what will happen, starts S80 as one batch that clears Undo, then goes Home', async () => {
    const log = stubApi(readyDocs());
    renderPage();
    expect(await screen.findByText('PL15 Club: Premier League → World League')).toBeTruthy();
    expect(screen.getByText('WL01 Club: World League → Premier League')).toBeTruthy();
    expect(screen.getByText('Undo history will be cleared.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start S80' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0]).toMatchObject({ label: 'Start S80', resetUndo: true });
    expect(log.batches[0].writes.map(w => w.path)).toEqual([
      'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json', 'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/S79/transactions.json',
      'leagues/fba/S80/rosters.json', 'leagues/fba/S80/freeAgents.json', 'leagues/fba/S80/transactions.json',
      'leagues/fbad2/S80/rosters.json', 'leagues/fbad2/S80/reserves.json', 'leagues/fbad2/S80/transactions.json',
      'leagues/fbad2/teams.json', 'calendar.json', 'meta.json',
    ]);
    expect(log.batches[0].writes.filter(w => w.path.includes('/S80/')).every(w => w.baseVersion === null)).toBe(true);
    expect(await screen.findByText('Home page')).toBeTruthy();
  });

  it('lists the problems instead of the button when the season is not over', async () => {
    const docs = readyDocs();
    const cal = calendarFor(79);
    docs['calendar.json'] = { ...cal, steps: cal.steps.map(s => ({ ...s, done: s.id !== 'fbajc' })) };
    stubApi(docs);
    renderPage();
    expect(await screen.findByText('Finish every S79 calendar step first (current step: FBAJC)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start S80' })).toBeNull();
  });
});
