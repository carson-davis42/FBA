// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { playAllConf, startConfTournaments } from '../../engine/jc/confTourney';
import { setFields } from '../../engine/jc/fieldMoves';
import { jcPlayedFixture, jcReadyForNit } from '../../engine/jc/testFixtures';
import type { JcState } from '../../engine/jc/state';
import { PostseasonPage } from './PostseasonPage';
import { docsOf } from './postseasonTestDocs';

let batches: { writes: { path: string; baseVersion: string | null }[] }[] = [];
let played: JcState;
let afterConf: JcState;
let ready: JcState;
beforeAll(() => {
  played = jcPlayedFixture();
  const s = startConfTournaments(played);
  if (!s.ok) throw new Error(s.problems.join());
  const c = playAllConf(s.state, mulberry32(5));
  if (!c.ok) throw new Error(c.problems.join());
  afterConf = c.state;
  ready = jcReadyForNit();
}, 240000);

function mount(s: JcState, entry = '/league/fbajc/postseason') {
  batches = [];
  const docs = docsOf(s);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') {
      batches.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ batchId: 'b1', versions: {} }), { status: 200 });
    }
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  return render(<MemoryRouter initialEntries={[entry]}><PostseasonPage /></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PostseasonPage', () => {
  it('starts the conference tournaments once the season is played', async () => {
    mount(played);
    const start = await screen.findByRole('button', { name: 'Start conference tournaments' });
    expect(screen.getByText(/S79 FBAJC Postseason/)).toBeTruthy();
    fireEvent.click(start);
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes.map(w => w.path)).toEqual(['leagues/fbajc/S79/postseason.json']);
    expect(batches[0].writes[0].baseVersion).toBeNull();
  });

  it('shows a conference bracket with its regular-season champions', async () => {
    mount(afterConf, '/league/fbajc/postseason?tab=conference');
    expect(await screen.findByRole('group', { name: /bracket/i })).toBeTruthy();
    expect(screen.getByText(/Regular-season champion/)).toBeTruthy();
    expect(screen.getByText(/Tournament champion/)).toBeTruthy();
    expect(screen.getAllByText('Quarterfinals').length).toBeGreaterThan(0);
  });

  it('sets the fields, then lists March Madness regions and the NIT', async () => {
    mount(afterConf, '/league/fbajc/postseason?tab=field');
    fireEvent.click(await screen.findByRole('button', { name: 'Set the fields' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes[0].path).toBe('leagues/fbajc/S79/postseason.json');
    cleanup();
    const withField = setFields(afterConf);
    if (!withField.ok) throw new Error('x');
    mount(withField.state, '/league/fbajc/postseason?tab=field');
    expect(await screen.findByText('Region 4')).toBeTruthy();
    expect(screen.getAllByText(/\(conf\. champion\)/).length).toBe(18);
    expect(screen.getByRole('button', { name: 'Re-draw the fields' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Swap' })).toBeTruthy();
  });

  it('plays an NIT round: 16 first-round games, then a save of the postseason and rosters', async () => {
    mount(ready);
    await screen.findByText(/NIT is next/);
    const bracket = await screen.findByRole('group', { name: 'NIT bracket' });
    expect(within(bracket).getByText('Round of 32')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Region 1' }));
    expect(bracket.querySelectorAll('[data-game]').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Play round' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes.map(w => w.path).sort()).toEqual(['leagues/fbajc/S79/postseason.json', 'leagues/fbajc/S79/rosters.json']);
  });

  it('keeps March Madness locked until the NIT is won', async () => {
    mount(ready, '/league/fbajc/postseason?tab=mm');
    expect(await screen.findByText('Finish the NIT first')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Play round' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
