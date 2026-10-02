// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayersFile } from '../../engine/shared/types';
import { linkTransactionLine, uniqueNameIndex } from './LinkedPlayers';
import { PlayerName } from './PlayerName';

afterEach(cleanup);

const players = { nextId: 5, players: {
  p00001: { id: 'p00001', name: 'Gabriel Greenwood', birthSeason: 1 }, p00002: { id: 'p00002', name: 'Dan Price', birthSeason: 1 },
  p00003: { id: 'p00003', name: 'Twin Name', birthSeason: 1 }, p00004: { id: 'p00004', name: 'Twin Name', birthSeason: 2 },
} } as unknown as PlayersFile;
const index = uniqueNameIndex(players);
const show = (line: string) => render(<MemoryRouter>{linkTransactionLine(line, index)}</MemoryRouter>);

describe('uniqueNameIndex', () => {
  it('keeps only names that belong to one player', () => {
    expect([...index.keys()].sort()).toEqual(['dan price', 'gabriel greenwood']);
  });
});

describe('linkTransactionLine', () => {
  it('links the player in each kind of move line and keeps the rest of the text', () => {
    for (const [line, id, text] of [
      ['Signed C-Dan Price (2/$2, thru S80)', 'p00002', 'Signed C-Dan Price (2/$2, thru S80)'],
      ['Released SG-Gabriel Greenwood', 'p00001', 'Released SG-Gabriel Greenwood'],
      ['Edited PG-Gabriel Greenwood: rating 95→96', 'p00001', 'Edited PG-Gabriel Greenwood: rating 95→96'],
      ['->MON SG-Dan Price', 'p00002', '->MON SG-Dan Price'],
    ]) {
      const { container } = show(line);
      expect(container.querySelector('a')!.getAttribute('href'), line).toBe(`/history/fba/players/${id}`);
      expect(container.textContent).toBe(text);
      cleanup();
    }
  });
  it('leaves an ambiguous or unknown name, a pick and a plain line as text', () => {
    for (const line of ['Signed PG-Twin Name (1/$1)', 'Released PG-Nobody Known', '->CAR S81 Draft Pick(via MON)(4P)', 'Free agency closed: 2 unsigned players moved to D2 Reserves']) {
      const { container } = show(line);
      expect(container.querySelector('a'), line).toBeNull();
      expect(container.textContent).toBe(line);
      cleanup();
    }
  });
});

describe('PlayerName', () => {
  it('links a real id, and stays text for no id, a generated id, or outside a router', () => {
    const inRouter = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>).container;
    expect(inRouter(<PlayerName id="p00007" name="A B" />).querySelector('a')!.getAttribute('href')).toBe('/history/fba/players/p00007');
    cleanup();
    expect(inRouter(<PlayerName id={null} name="Vacant" />).querySelector('a')).toBeNull();
    cleanup();
    expect(inRouter(<PlayerName id="BRA:PG" name="BRA PG" />).querySelector('a')).toBeNull();
    cleanup();
    const bare = render(<PlayerName id="p00007" name="A B" />);
    expect(bare.container.querySelector('a')).toBeNull();
    expect(bare.container.textContent).toBe('A B');
  });
});
