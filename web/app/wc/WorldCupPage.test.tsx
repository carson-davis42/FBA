// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TeamsFile, WorldCupFile } from '../../engine/shared/types';
import { countryRating } from '../../engine/wc/rating';
import { d2Fixture, runFullWorldCup } from '../../engine/wc/testRun';
import { WorldCupPage } from './WorldCupPage';

const teams = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../data/leagues/fbawc/teams.json'), 'utf8')) as TeamsFile;
let full: ReturnType<typeof runFullWorldCup>;
beforeAll(() => { full = runFullWorldCup(3); }, 60000);

let batches: { writes: { path: string; baseVersion: string | null }[] }[] = [];

function wcWith(played: number): WorldCupFile {
  return { ...full.w.worldCup!, groupGames: full.w.worldCup!.groupGames.slice(0, played), knockout: [], champion: null, runnerUp: null };
}

function docsFor(wc: WorldCupFile | null): Record<string, unknown> {
  const docs: Record<string, unknown> = {
    'meta.json': { currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 80, fbawc: 79 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 } },
    'calendar.json': full.w.calendar,
    'leagues/fbawc/teams.json': teams,
    'leagues/fbawc/hosts.json': { hosts: [{ season: 80, city: 'Rome', country: 'Italy' }] },
    'leagues/fbad2/S80/rosters.json': d2Fixture(),
    'leagues/fbawc/S79/rosters.json': full.q.rosters,
    'leagues/fbawc/S79/qualifying.json': full.q.qualifying,
  };
  if (wc) {
    docs['leagues/fbawc/S80/rosters.json'] = full.w.rosters;
    docs['leagues/fbawc/S80/worldcup.json'] = wc;
  }
  return docs;
}

function mount(docs: Record<string, unknown>, url = '/league/fbawc/worldcup') {
  batches = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    if (u === '/api/batch') {
      batches.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ batchId: 'b1', versions: {} }), { status: 200 });
    }
    const doc = docs[u.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(<MemoryRouter initialEntries={[url]}><WorldCupPage /></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('WorldCupPage', () => {
  it('Start posts one batch writing rosters and worldcup with null base versions', async () => {
    mount(docsFor(null));
    expect(await screen.findByText(/16 groups of 4/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Start World Cup/ }));
    await waitFor(() => expect(batches.length).toBe(1));
    const w = batches[0].writes;
    expect(w.map(x => x.path).sort()).toEqual(['leagues/fbawc/S80/rosters.json', 'leagues/fbawc/S80/worldcup.json']);
    expect(w.every(x => x.baseVersion === null)).toBe(true);
  });

  it('has no Start button once the World Cup exists', async () => {
    mount(docsFor(wcWith(10)));
    expect(await screen.findByText(/10 of 192 group games played/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start World Cup/ })).toBeNull();
  });

  it('Start is disabled with a reason when qualifying is missing', async () => {
    const docs = docsFor(null);
    delete docs['leagues/fbawc/S79/qualifying.json'];
    mount(docs);
    const b = (await screen.findByRole('button', { name: /Start World Cup/ })) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(screen.getByText(/qualifying must be finished first/)).toBeTruthy();
  });

  it('renders 16 group cards with 4 rows each and a legend', async () => {
    const { container } = mount(docsFor(wcWith(192)));
    await screen.findByText(/192 of 192 group games played/);
    expect(container.querySelectorAll('.wc-group').length).toBe(16);
    for (const card of Array.from(container.querySelectorAll('.wc-group'))) expect(card.querySelectorAll('tbody tr').length).toBe(4);
    expect(container.querySelectorAll('.wc-host-group').length).toBe(1);
    expect(container.querySelector('.clinch-legend')).toBeTruthy();
  });

  it('Play all groups saves exactly once', async () => {
    mount(docsFor(wcWith(180)));
    fireEvent.click(await screen.findByRole('button', { name: /Play all groups/ }));
    await waitFor(() => expect(batches.length).toBe(1));
    await new Promise(r => setTimeout(r, 50));
    expect(batches.length).toBe(1);
    expect(batches[0].writes.map(x => x.path)).toEqual(['leagues/fbawc/S80/worldcup.json']);
  });

  it('Finish groups is enabled only at 192 games', async () => {
    const { unmount } = mount(docsFor(wcWith(191)));
    const f = (await screen.findByRole('button', { name: /Finish groups/ })) as HTMLButtonElement;
    expect(f.disabled).toBe(true);
    unmount();
    mount(docsFor(wcWith(192)));
    await waitFor(() => expect(((screen.getByRole('button', { name: /Finish groups/ })) as HTMLButtonElement).disabled).toBe(false));
  });

  it('?tab=teams lists the 64 teams by rating, linked to their pages', async () => {
    const { container } = mount(docsFor(wcWith(5)), '/league/fbawc/worldcup?tab=teams');
    await waitFor(() => expect(container.querySelectorAll('.wc-team').length).toBe(64));
    expect(container.querySelector('.wc-group')).toBeNull();
    const ratings = Array.from(container.querySelectorAll('.wc-team-rating')).map(e => Number(e.textContent));
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    const top = [...full.w.worldCup!.field].sort((a, b) => countryRating(full.w.rosters.teams[b]) - countryRating(full.w.rosters.teams[a]))[0];
    expect(container.querySelector('.wc-team a')?.getAttribute('href')).toBe(`/league/fbawc/team/${top}`);
  });

  it('switches tabs by clicking', async () => {
    const { container } = mount(docsFor(wcWith(5)));
    await screen.findByText(/5 of 192/);
    fireEvent.click(screen.getByRole('tab', { name: 'Teams' }));
    await waitFor(() => expect(container.querySelectorAll('.wc-team').length).toBe(64));
  });
});
