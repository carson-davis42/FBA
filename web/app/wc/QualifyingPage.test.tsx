// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { calendarFor } from '../../engine/shared/calendar';
import type { CalendarFile, QualifyingFile, RostersFile, TeamsFile } from '../../engine/shared/types';
import { finishQualifying, playQualifyingGame, startQualifying, type QualifyingState } from '../../engine/wc/qualifying';
import { d2Fixture } from '../../engine/wc/testRun';
import { QualifyingPage } from './QualifyingPage';

const teams = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../data/leagues/fbawc/teams.json'), 'utf8')) as TeamsFile;
const ids = teams.teams.map(t => t.teamId);
const host = teams.teams[0];
const cal79 = calendarFor(79);
const calOpen: CalendarFile = { ...cal79, steps: cal79.steps.map(s => (s.id === 's79-qualifying' ? s : { ...s, done: true })) };
const calWrong: CalendarFile = { ...cal79, steps: cal79.steps.map(s => ({ ...s, done: false })) };

function started(played: number, finish = false): QualifyingState {
  const rng = mulberry32(5);
  const s0 = startQualifying({ season: 79, calendar: calOpen, d2Rosters: d2Fixture(), countries: ids, host: host.teamId, previousWc: null }, rng);
  if (!s0.ok) throw new Error(s0.problems.join());
  let s = s0.state;
  for (let i = 0; i < played; i++) {
    const r = playQualifyingGame(s, rng);
    if (!r.ok) throw new Error(r.problems.join());
    s = r.state;
  }
  if (finish) {
    const f = finishQualifying(s);
    if (!f.ok) throw new Error(f.problems.join());
    s = f.state;
  }
  return s;
}

let batches: { writes: { path: string; baseVersion: string | null }[] }[] = [];

function mount(docs: Record<string, unknown>) {
  batches = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') {
      batches.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ batchId: 'b1', versions: {} }), { status: 200 });
    }
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(<MemoryRouter><QualifyingPage /></MemoryRouter>);
}

function base(cal: CalendarFile, s?: QualifyingState): Record<string, unknown> {
  const docs: Record<string, unknown> = {
    'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    'calendar.json': s ? s.calendar : cal,
    'leagues/fbawc/teams.json': teams,
    'leagues/fbawc/hosts.json': { hosts: [{ season: 80, city: 'X', country: host.name }] },
    'leagues/fbad2/S79/rosters.json': d2Fixture() satisfies RostersFile,
  };
  if (s) {
    docs['leagues/fbawc/S79/rosters.json'] = s.rosters;
    docs['leagues/fbawc/S79/qualifying.json'] = s.qualifying as QualifyingFile;
  }
  return docs;
}

beforeEach(() => undefined);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('QualifyingPage', () => {
  it('shows only Start and the rule note before it starts', async () => {
    mount(base(calOpen));
    expect(await screen.findByRole('button', { name: /Start qualifying/ })).toBeTruthy();
    expect(screen.getByText(/top 15 countries by rating/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Play next/ })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('Start posts one batch writing rosters and qualifying with null base versions', async () => {
    mount(base(calOpen));
    fireEvent.click(await screen.findByRole('button', { name: /Start qualifying/ }));
    await waitFor(() => expect(batches.length).toBe(1));
    const w = batches[0].writes;
    expect(w.map(x => x.path).sort()).toEqual(['leagues/fbawc/S79/qualifying.json', 'leagues/fbawc/S79/rosters.json']);
    expect(w.every(x => x.baseVersion === null)).toBe(true);
  });

  it('shows 15 auto chips, 70 rows and a cut line after row 49 once started', async () => {
    const { container } = mount(base(calOpen, started(0)));
    expect(await screen.findByText('0 of 210 games played · 210 to go')).toBeTruthy();
    expect(container.querySelectorAll('.wc-auto li').length).toBe(15);
    expect(container.querySelectorAll('tbody tr').length).toBe(70);
    const cut = container.querySelectorAll('tbody tr')[48];
    expect(cut.classList.contains('wc-cut')).toBe(true);
    expect(container.querySelectorAll('tr.wc-cut').length).toBe(1);
  });

  it('Play all saves exactly once', async () => {
    mount(base(calOpen, started(200)));
    fireEvent.click(await screen.findByRole('button', { name: /Play all/ }));
    await waitFor(() => expect(batches.length).toBe(1));
    await new Promise(r => setTimeout(r, 50));
    expect(batches.length).toBe(1);
    expect(batches[0].writes.map(x => x.path)).toEqual(['leagues/fbawc/S79/qualifying.json']);
  });

  it('keeps Finish disabled until all 210 games are played', async () => {
    const { unmount } = mount(base(calOpen, started(209)));
    const finish = (await screen.findByRole('button', { name: /Finish/ })) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
    unmount();
    mount(base(calOpen, started(210)));
    await waitFor(() => expect(((screen.getByRole('button', { name: /Finish/ })) as HTMLButtonElement).disabled).toBe(false));
  });

  it('shows 49 Qualified bars and a continue link once finished', async () => {
    const { container } = mount(base(calOpen, started(210, true)));
    expect(await screen.findByText('Finished')).toBeTruthy();
    expect(container.querySelectorAll('tbody tr').length).toBe(49);
    expect(container.querySelectorAll('tbody td.clinch-qualified').length).toBe(49);
    expect(container.querySelector('.clinch-legend')).toBeTruthy();
    const link = screen.getByRole('link', { name: /Continue to the World Cup/ });
    expect(link.getAttribute('href')).toBe('/calendar');
    expect(within(container as HTMLElement).queryByRole('button', { name: /Play/ })).toBeNull();
  });

  it('disables the buttons when the calendar step is not current', async () => {
    mount(base(calWrong));
    const start = (await screen.findByRole('button', { name: /Start qualifying/ })) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.getByText(/at the/i)).toBeTruthy();
  });

  it('says qualifying runs in odd seasons for an even season', async () => {
    const docs = base(calOpen);
    docs['meta.json'] = { currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 80, fbawc: 79 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 } };
    mount(docs);
    expect(await screen.findByText(/Qualifying runs in odd seasons/)).toBeTruthy();
  });
});
