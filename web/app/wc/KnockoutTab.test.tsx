// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BoxLine, GameResult, SummaryFile, TeamsFile, WorldCupFile } from '../../engine/shared/types';
import { d2Fixture, runFullWorldCup } from '../../engine/wc/testRun';
import { WorldCupPage } from './WorldCupPage';

const teams = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../data/leagues/fbawc/teams.json'), 'utf8')) as TeamsFile;
const teamName = (id: string) => teams.teams.find(t => t.teamId === id)!.name;
let full: ReturnType<typeof runFullWorldCup>;
beforeAll(() => { full = runFullWorldCup(3); }, 60000);

let batches: { writes: { path: string; doc: Record<string, unknown>; baseVersion: string | null }[] }[] = [];

const line = (playerId: string, pts: number): BoxLine => ({ playerId, pts }) as BoxLine;

/** Every box emptied, then three group games give p00001 and a generated player 3 games, and p00002 only 2. */
function handBuilt(): { wc: WorldCupFile; generatedKey: string } {
  const base = full.w.worldCup!;
  const strip = (g: GameResult): GameResult => ({ ...g, box: { home: [], away: [] } });
  const groupGames = base.groupGames.map(strip);
  const generatedKey = `${groupGames[0].home}:PG`;
  for (let i = 0; i < 3; i++) groupGames[i] = { ...groupGames[i], box: { home: [line('p00001', 20), line(generatedKey, 12)], away: i < 2 ? [line('p00002', 30)] : [] } };
  return { wc: { ...base, groupGames, knockout: base.knockout.map(k => (k.game ? { ...k, game: strip(k.game) } : k)) }, generatedKey };
}

function docsFor(wc: WorldCupFile, summary?: SummaryFile): Record<string, unknown> {
  const docs: Record<string, unknown> = {
    'meta.json': { currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 80, fbawc: 79 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 } },
    'calendar.json': full.w.calendar,
    'leagues/fbawc/teams.json': teams,
    'leagues/fbawc/hosts.json': { hosts: [{ season: 80, city: 'Rome', country: 'Italy' }] },
    'leagues/fbad2/S80/rosters.json': d2Fixture(),
    'leagues/fbawc/S79/rosters.json': full.q.rosters,
    'leagues/fbawc/S79/qualifying.json': full.q.qualifying,
    'leagues/fbawc/S80/rosters.json': full.w.rosters,
    'leagues/fbawc/S80/worldcup.json': wc,
  };
  if (summary) docs['leagues/fbawc/S80/summary.json'] = summary;
  return docs;
}

function mount(docs: Record<string, unknown>) {
  batches = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    if (u === '/api/batch') {
      batches.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ batchId: 'b1', versions: {} }), { status: 200 });
    }
    const doc = docs[u.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(<MemoryRouter initialEntries={['/league/fbawc/worldcup?tab=knockout']}><WorldCupPage /></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('KnockoutTab', () => {
  it('renders 31 match cards in 5 columns and the champion banner', async () => {
    const wc = full.w.worldCup!;
    const { container } = mount(docsFor(wc));
    await waitFor(() => expect(container.querySelectorAll('.wc-match').length).toBe(31));
    expect(container.querySelectorAll('.wc-round').length).toBe(5);
    expect(container.querySelector('.wc-champion')?.textContent).toContain(teamName(wc.champion!));
    expect(container.querySelector('.wc-champion')?.textContent).toContain('World Cup champion');
  });

  it('shows the empty message before the knockout starts', async () => {
    mount(docsFor({ ...full.w.worldCup!, knockout: [], champion: null, runnerUp: null }));
    expect(await screen.findByText('The knockout starts when the groups finish.')).toBeTruthy();
  });

  it('lists only players with 3 games and labels generated ones', async () => {
    const { wc, generatedKey } = handBuilt();
    const { container } = mount(docsFor(wc));
    await waitFor(() => expect(container.querySelector('.wc-mvp')).toBeTruthy());
    const rows = Array.from(container.querySelectorAll('.wc-mvp tbody tr'));
    expect(rows.length).toBe(2);
    const text = rows.map(r => r.textContent ?? '').join('|');
    expect(text).toContain('p00001');
    expect(text).not.toContain('p00002');
    expect(text).toContain(`${teamName(generatedKey.split(':')[0])} PG`);
    expect(text).toContain('Generated');
  });

  it('Finish is disabled until a pick, then posts one batch with a real MVP', async () => {
    const { wc } = handBuilt();
    mount(docsFor(wc));
    const finish = (await screen.findByRole('button', { name: /Finish World Cup/ })) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
    const row = screen.getByText('p00001').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /Pick/ }));
    await waitFor(() => expect(((screen.getByRole('button', { name: /Finish World Cup/ })) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Finish World Cup/ }));
    await waitFor(() => expect(batches.length).toBe(1));
    await new Promise(r => setTimeout(r, 50));
    expect(batches.length).toBe(1);
    expect(batches[0].writes.map(x => x.path).sort()).toEqual(['calendar.json', 'leagues/fbawc/S80/summary.json']);
    expect(batches[0].writes.find(x => x.path.endsWith('summary.json'))!.baseVersion).toBeNull();
    const champ = (batches[0].writes.find(x => x.path.endsWith('summary.json'))!.doc as { champions: { finalsMvp: string | null }[] }).champions[0];
    expect(champ.finalsMvp).toBe('p00001');
  });

  it('a generated pick stores finalsMvp null and mvpName', async () => {
    const { wc, generatedKey } = handBuilt();
    const { container } = mount(docsFor(wc));
    await waitFor(() => expect(container.querySelector('.wc-mvp')).toBeTruthy());
    const row = Array.from(container.querySelectorAll('.wc-mvp tbody tr')).find(r => r.textContent?.includes('Generated'))!;
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /Pick/ }));
    await waitFor(() => expect(((screen.getByRole('button', { name: /Finish World Cup/ })) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Finish World Cup/ }));
    await waitFor(() => expect(batches.length).toBe(1));
    const champ = (batches[0].writes.find(x => x.path.endsWith('summary.json'))!.doc as { champions: { finalsMvp: string | null; mvpName?: string }[] }).champions[0];
    expect(champ.finalsMvp).toBeNull();
    expect(champ.mvpName).toBe(`${teamName(generatedKey.split(':')[0])} PG`);
  });

  it('an existing summary shows the finished message and no Finish button', async () => {
    const wc = full.w.worldCup!;
    const summary = { league: 'fbawc', season: 80, locked: true, host: 'Italy', champions: [{ title: 'World Cup Champion', champion: teamName(wc.champion!), runnerUp: 'X', score: null, teamId: wc.champion!, runnerUpId: wc.runnerUp!, finalsMvp: null, mvpName: 'Italy PG' }] } as SummaryFile;
    mount(docsFor(wc, summary));
    expect(await screen.findByText(`World Cup finished: ${teamName(wc.champion!)}, MVP Italy PG`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Finish World Cup/ })).toBeNull();
  });
});
