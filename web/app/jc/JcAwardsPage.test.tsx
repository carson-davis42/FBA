// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { playAllConf, startConfTournaments } from '../../engine/jc/confTourney';
import { setFields } from '../../engine/jc/fieldMoves';
import { playPostToEnd } from '../../engine/jc/postseason';
import { jcPlayedFixture, jcReadyForNit } from '../../engine/jc/testFixtures';
import type { JcState } from '../../engine/jc/state';
import { JcAwardsPage } from './JcAwardsPage';
import { docsOf } from './postseasonTestDocs';

let batches: { writes: { path: string; baseVersion: string | null }[] }[] = [];
let withFields: JcState;
let ready: JcState;
let tournamentsDone: JcState;
beforeAll(() => {
  const must = (r: { ok: boolean; state?: JcState; problems?: string[] }): JcState => {
    if (!r.ok) throw new Error(r.problems!.join());
    return r.state!;
  };
  const conf = must(playAllConf(must(startConfTournaments(jcPlayedFixture())), mulberry32(5)));
  withFields = must(setFields(conf));
  ready = jcReadyForNit();
  tournamentsDone = must(playPostToEnd(must(playPostToEnd(ready, 'nit', mulberry32(2))), 'mm', mulberry32(3)));
}, 300000);

function mount(s: JcState) {
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
  return render(<MemoryRouter><JcAwardsPage /></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('JcAwardsPage', () => {
  it('starts the awards after the fields are set', async () => {
    mount(withFields);
    fireEvent.click(await screen.findByRole('button', { name: 'Start the awards' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes.map(w => w.path)).toEqual(['leagues/fbajc/S79/awards.json']);
    expect(batches[0].writes[0].baseVersion).toBeNull();
  });

  it('shows the six national races with odds and says the NIT can start when every award is picked', async () => {
    mount(ready);
    expect(await screen.findByText(/Every award has a winner/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Trae York Player of the Year' })).toBeTruthy();
    const dpoy = screen.getByRole('region', { name: 'Dawson Chudnovsky Defensive Player of the Year' });
    expect(within(dpoy).getByText('Saved/G')).toBeTruthy();
    expect(screen.getByText('Picked after the NIT and March Madness.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Finish S79 season/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('picking a different winner saves the awards doc once', async () => {
    mount(ready);
    const poy = await screen.findByRole('region', { name: 'Trae York Player of the Year' });
    const pick = within(poy).getAllByRole('button', { name: 'Pick' }).find(b => !(b as HTMLButtonElement).disabled)!;
    fireEvent.click(pick);
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes.map(w => w.path)).toEqual(['leagues/fbajc/S79/awards.json']);
  });

  it('after both tournaments: the All-American picker offers 15 slots and the MVP lists the champion roster', async () => {
    mount(tournamentsDone);
    expect(await screen.findByRole('button', { name: 'Suggest all three teams' })).toBeTruthy();
    expect(screen.getByLabelText('Team 1 G 1')).toBeTruthy();
    expect(screen.getByLabelText('Team 3 ANY 5')).toBeTruthy();
    const mvp = screen.getByLabelText('March Madness MVP') as HTMLSelectElement;
    expect(mvp.options.length).toBe(6);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest all three teams' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes[0].path).toBe('leagues/fbajc/S79/awards.json');
  });
});
