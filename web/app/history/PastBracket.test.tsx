// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Bracket } from '../playoffs/Bracket';
import type { FranchisesFile, PastBracket as PastBracketDoc, PastSeries, PlayoffSeries, Team } from '../../engine/shared/types';
import { PastBracket } from './PastBracket';

afterEach(cleanup);

const side = (name: string, seed: number | null = 1) => ({ name, record: null, seed });
const ps = (id: string, home: string | null, away: string | null, homeWins: number, awayWins: number, winner: 'home' | 'away' = 'home'): PastSeries => ({
  id, round: Number(id[1]), home: home ? side(home) : null, away: away ? side(away, 2) : null, homeWins, awayWins, winner,
});

/** An 8-team tree: 4 R1, 2 R2, 1 final. */
const tree: PastBracketDoc = {
  rounds: 3,
  series: [
    ps('R1-1', 'Alpha', 'Beta', 4, 1), ps('R1-2', 'Gamma', 'Delta', 4, 2), ps('R1-3', 'Eps', 'Zeta', 4, 3), ps('R1-4', 'Eta', 'Theta', 4, 0),
    ps('R2-1', 'Alpha', 'Gamma', 4, 2), ps('R2-2', 'Eps', 'Eta', 4, 1),
    ps('R3-1', 'Alpha', 'Eps', 4, 3),
  ],
};
const teams: Team[] = [{ teamId: 't1', name: 'Alpha', abbr: 'ALP', group: null, logoFolder: 'Alpha', badge: { bg: '#000', fg: '#fff' } }];

describe('PastBracket', () => {
  it('lays out an 8-team tree as left half, centre, mirrored right half', () => {
    const { container } = render(<PastBracket bracket={tree} teams={teams} season={5} />);
    const cols = [...container.querySelectorAll('.bracket-col')];
    expect(cols.map(c => c.querySelectorAll('.series-box').length)).toEqual([2, 1, 1, 1, 2]);
    expect(cols[2].textContent).toContain('4');
    expect(container.querySelectorAll('.bracket > .bracket-col')).toHaveLength(5);
  });

  it('marks the winner side and shows wins', () => {
    const { container } = render(<PastBracket bracket={tree} teams={teams} season={5} />);
    const box = container.querySelectorAll('.bracket-col')[2].querySelector('.series-box')!;
    const sides = box.querySelectorAll('.series-side');
    expect(sides[0].className).toContain('won');
    expect(sides[1].className).not.toContain('won');
    expect(sides[0].querySelector('.wins')!.textContent).toBe('4');
    expect(sides[1].querySelector('.wins')!.textContent).toBe('3');
  });

  it('shows BYE for a null side, with no wins', () => {
    const b: PastBracketDoc = { rounds: 1, series: [ps('R1-1', 'Alpha', null, 0, 0)] };
    const { container } = render(<PastBracket bracket={b} teams={[]} season={5} />);
    expect(container.querySelectorAll('.bracket-col')).toHaveLength(1);
    const sides = container.querySelectorAll('.series-side');
    expect(sides[1].querySelector('.name')!.textContent).toBe('BYE');
    expect(sides[1].querySelector('.wins')!.textContent).toBe('');
  });

  it('renders a team mark for a current team name, and plain text otherwise', () => {
    const { container } = render(<PastBracket bracket={tree} teams={teams} season={5} />);
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ALP').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beta').length).toBeGreaterThan(0);
  });
});

describe('Bracket without onOpen', () => {
  it('renders series boxes as divs, not buttons', () => {
    const series: PlayoffSeries[] = [{
      id: 'FINALS', group: null, round: 4, home: 't1', away: 't1', homeSeed: 1, awaySeed: 2, homeWins: 4, awayWins: 1, winner: 't1', next: null,
    }];
    const { container } = render(<Bracket league="fba" series={series} teams={new Map(teams.map(t => [t.teamId, t]))} season={5} group={null} open={null} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('div.series-box')).toHaveLength(1);
  });
});

describe('PastBracket with franchises', () => {
  const mon: Team = { teamId: 'MON', name: 'Montreal Chevaliers', abbr: 'MON', group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } };
  const franchises: FranchisesFile = { franchises: [{ teamId: 'MON', eras: [{ name: 'Montreal', abbr: 'MTL', city: 'Montreal', from: 12, to: 56 }] }] };
  const bracket: PastBracketDoc = { rounds: 1, series: [{ id: 'R1-1', round: 1, home: { name: 'Montreal', record: null, seed: 1 }, away: { name: 'Gamma', record: null, seed: 2 }, homeWins: 4, awayWins: 1, winner: 'home' }] };
  it('marks an old name with its franchise and era abbreviation', () => {
    const { container } = render(<PastBracket bracket={bracket} teams={[mon]} season={30} franchises={franchises} />);
    expect(container.querySelectorAll('.series-side .team-name')).toHaveLength(1);
    expect(screen.getByText('MTL')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });
  it('keeps plain text without franchises', () => {
    const { container } = render(<PastBracket bracket={bracket} teams={[mon]} season={30} />);
    expect(container.querySelectorAll('.series-side .team-name')).toHaveLength(0);
    expect(screen.getByText('Montreal')).toBeTruthy();
  });
});

describe('PastBracket scored series', () => {
  it('shows the game score instead of the win counts', () => {
    const one: PastBracketDoc = { rounds: 1, series: [{ ...ps('R1-1', 'Japan', 'Korea', 1, 0), score: '97–75' }] };
    const { container } = render(<PastBracket bracket={one} teams={teams} season={5} />);
    const wins = [...container.querySelectorAll('.series-side .wins')].map(e => e.textContent);
    expect(wins).toEqual(['97', '75']);
  });
});
