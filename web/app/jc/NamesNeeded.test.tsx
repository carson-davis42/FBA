// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jcStateFixture } from '../../engine/jc/testFixtures';
import { NamesNeeded } from './NamesNeeded';

let batches: { label: string; writes: { path: string; baseVersion: string | null; doc: unknown }[] }[] = [];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup() {
  const s = jcStateFixture();
  const team = s.teams.teams[0];
  const e = s.rosters.teams[team.teamId].find(x => x.playerId !== null)!;
  e.classYear = 'Jr'; e.rating = 90;
  s.players.players[e.playerId!] = { ...s.players.players[e.playerId!], name: null };
  return { s, team, id: e.playerId! };
}

function mount(s: ReturnType<typeof setup>['s'], onSaved = vi.fn()) {
  batches = [];
  const docs: Record<string, unknown> = { 'players.json': s.players };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') {
      batches.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ batchId: 'b1', versions: {} }), { status: 200 });
    }
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
  render(<NamesNeeded state={s} onSaved={onSaved} />);
  return onSaved;
}

describe('NamesNeeded', () => {
  it('lists the unnamed players past the line with a box each, and saves the names with a bio in one batch', async () => {
    const { s, team, id } = setup();
    const onSaved = mount(s);
    const box = await screen.findByLabelText(new RegExp(`^Name for ${team.name} .*Jr, 90`));
    const save = screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(true));
    fireEvent.change(box, { target: { value: 'Marcus Bell' } });
    await waitFor(() => expect((screen.getByRole('button', { name: /Save 1 name/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Save 1 name/ }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0].writes.map(w => w.path)).toEqual(['players.json', 'leagues/fba/playerBios.json']);
    expect(batches[0].writes[1].baseVersion).toBeNull();
    const players = batches[0].writes[0].doc as { players: Record<string, { name: string }> };
    expect(players.players[id].name).toBe('Marcus Bell');
    expect(JSON.stringify(batches[0].writes[1].doc)).toContain(`${team.name}-S77-pres.`);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('shows nothing when nobody needs a name', () => {
    const s = jcStateFixture();
    mount(s);
    expect(screen.queryByRole('region', { name: 'Names needed' })).toBeNull();
  });

  it('shows the problem and saves nothing for a name that is already taken', async () => {
    const { s, id } = setup();
    const taken = Object.values(s.players.players).find(p => p.name && p.id !== id)!.name!;
    mount(s);
    const box = await screen.findByPlaceholderText('Full name');
    fireEvent.change(box, { target: { value: taken } });
    const save = screen.getByRole('button', { name: /Save 1 name/ }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    expect(await screen.findByText(/already a player's name/)).toBeTruthy();
    expect(batches).toHaveLength(0);
  });
});
