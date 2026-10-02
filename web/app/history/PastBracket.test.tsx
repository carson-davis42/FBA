// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

describe('PastBracket unscored series', () => {
  it('shows no numbers but still marks the winner', () => {
    const one: PastBracketDoc = { rounds: 1, series: [{ ...ps('R1-1', 'Japan', 'Korea', 0, 0), unscored: true }] };
    const { container } = render(<PastBracket bracket={one} teams={teams} season={5} />);
    const wins = [...container.querySelectorAll('.series-side .wins')].map(e => e.textContent);
    expect(wins).toEqual(['', '']);
    expect(container.querySelector('.series-box')!.textContent).not.toMatch(/\d\d|0/);
    expect(container.querySelectorAll('.series-side')[0].className).toContain('won');
  });
});

describe('PastBracket 6 rounds', () => {
  it('renders 63 series boxes in 11 columns', () => {
    const series: PastSeries[] = [];
    for (let r = 1; r <= 6; r++) {
      const n = 2 ** (6 - r), span = 2 ** r;
      for (let k = 1; k <= n; k++) {
        const lo = (k - 1) * span + 1;
        series.push(ps(`R${r}-${k}`, `T${lo}`, `T${lo + span / 2}`, 4, 1));
      }
    }
    const { container } = render(<PastBracket bracket={{ rounds: 6, series }} teams={[]} season={5} layout="tree" />);
    expect(container.querySelectorAll('.series-box')).toHaveLength(63);
    expect(container.querySelectorAll('.bracket > .bracket-col')).toHaveLength(11);
  });
});

describe('PastBracket rounds layout (32 and 64 slots)', () => {
  const full = (rounds: number, scored = true): PastBracketDoc => {
    const series: PastSeries[] = [];
    for (let r = 1; r <= rounds; r++) {
      const n = 2 ** (rounds - r), span = 2 ** r;
      for (let k = 1; k <= n; k++) {
        const lo = (k - 1) * span + 1;
        series.push({ ...ps(`R${r}-${k}`, `T${lo}`, `T${lo + span / 2}`, scored ? 1 : 0, 0), ...(scored ? { score: '60–50' } : { unscored: true as const }) });
      }
    }
    return { rounds, series };
  };
  const heads = (c: HTMLElement) => [...c.querySelectorAll('.col-head')].map(t => t.textContent);
  const colCounts = (c: HTMLElement) => [...c.querySelectorAll('.cols-col')].map(col => col.querySelectorAll('.series-box:not(.empty)').length);

  it('lays a 64-slot page out one-sided, a column per round labelled like the tournament, every game of a round in its column', () => {
    const { container } = render(<PastBracket bracket={full(6)} teams={[]} season={63} />);
    expect(heads(container)).toEqual(['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship']);
    expect(colCounts(container)).toEqual([32, 16, 8, 4, 2, 1]);
    expect(container.querySelectorAll('.bracket-col')).toHaveLength(0);
    expect(container.querySelectorAll('.cols-col:last-child .champ-badge')).toHaveLength(1);
  });

  it('labels a 32-team page from its field size, and shows scores and OT tags in the cards', () => {
    const b = full(5);
    b.series[0] = { ...b.series[0], score: '53–51 2OT' };
    const { container } = render(<PastBracket bracket={b} teams={[]} season={11} />);
    expect(heads(container)).toEqual(['Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship']);
    expect(colCounts(container)).toEqual([16, 8, 4, 2, 1]);
    expect(container.querySelector('.series-ot')!.textContent).toBe('2OT');
  });

  it('keeps every slot so the games line up: a missing game is an invisible spacer, and a lone BYE shows as a BYE row', () => {
    const b = full(5);
    b.series[3] = { ...b.series[3], away: null, score: undefined, homeWins: 0, unscored: undefined };
    b.series[4] = { ...b.series[4], home: null, away: null };
    const { container } = render(<PastBracket bracket={b} teams={[]} season={11} />);
    expect(container.querySelectorAll('.col-slot')).toHaveLength(31);
    expect(container.querySelectorAll('.cols-col')[0].querySelectorAll('.col-slot')).toHaveLength(16);
    expect(container.querySelectorAll('.series-box.empty')).toHaveLength(1);
    expect(screen.getAllByText('BYE').length).toBeGreaterThan(0);
  });

  it('leaves the small brackets as the two-sided tree', () => {
    const { container } = render(<PastBracket bracket={full(4)} teams={[]} season={5} />);
    expect(container.querySelectorAll('.bracket > .bracket-col')).toHaveLength(7);
    expect(container.querySelector('.cols')).toBeNull();
  });
});

describe('PastBracket college pages', () => {
  const sd = (name: string, record: string | null, seed: number | null = null) => ({ name, record, seed });

  it('shows an overtime score with the points beside each team and an OT tag', () => {
    const one: PastBracketDoc = { rounds: 1, series: [{ id: 'R1-1', round: 1, home: sd('Kansas', '22-1', 1), away: sd('Texas', '13-9'), homeWins: 1, awayWins: 0, winner: 'home', score: '53–51 2OT' }] };
    const { container } = render(<PastBracket bracket={one} teams={[]} season={63} />);
    expect([...container.querySelectorAll('.series-side .wins')].map(e => e.textContent)).toEqual(['53', '51']);
    expect(container.querySelector('.series-ot')!.textContent).toBe('2OT');
  });

  it('has no OT tag for a regulation score', () => {
    const one: PastBracketDoc = { rounds: 1, series: [{ id: 'R1-1', round: 1, home: sd('Kansas', null), away: sd('Texas', null), homeWins: 1, awayWins: 0, winner: 'home', score: '29-27' }] };
    const { container } = render(<PastBracket bracket={one} teams={[]} season={63} />);
    expect(container.querySelector('.series-ot')).toBeNull();
  });

  it('prints records only when asked', () => {
    const one: PastBracketDoc = { rounds: 1, series: [{ id: 'R1-1', round: 1, home: sd('Kansas', '22-1', 1), away: sd('Texas', '13-9'), homeWins: 1, awayWins: 0, winner: 'home', score: '29-27' }] };
    const off = render(<PastBracket bracket={one} teams={[]} season={63} />);
    expect(off.container.querySelectorAll('.rec')).toHaveLength(0);
    cleanup();
    const on = render(<PastBracket bracket={one} teams={[]} season={63} showRecords />);
    expect([...on.container.querySelectorAll('.series-side .rec')].map(e => e.textContent)).toEqual(['22-1', '13-9']);
  });

  it('draws two BYE slots as an invisible spacer and a lone BYE as a BYE row', () => {
    const b: PastBracketDoc = {
      rounds: 2,
      series: [
        { id: 'R1-1', round: 1, home: sd('Kansas', null), away: null, homeWins: 0, awayWins: 0, winner: 'home' },
        { id: 'R1-2', round: 1, home: null, away: null, homeWins: 0, awayWins: 0, winner: 'home' },
        { id: 'R2-1', round: 2, home: sd('Kansas', null), away: null, homeWins: 0, awayWins: 0, winner: 'home' },
      ],
    };
    const { container } = render(<PastBracket bracket={b} teams={[]} season={14} />);
    const empty = container.querySelectorAll('.series-box.empty');
    expect(empty).toHaveLength(1);
    expect(empty[0].getAttribute('aria-hidden')).toBe('true');
    expect(empty[0].textContent).toBe('');
    expect(screen.getAllByText('BYE').length).toBeGreaterThan(0);
  });

  it('draws a 5-round (32-team) page in 9 columns', () => {
    const series: PastSeries[] = [];
    for (let r = 1; r <= 5; r++) {
      const n = 2 ** (5 - r), span = 2 ** r;
      for (let k = 1; k <= n; k++) {
        const lo = (k - 1) * span + 1;
        series.push({ ...ps(`R${r}-${k}`, `T${lo}`, `T${lo + span / 2}`, 0, 0), unscored: true });
      }
    }
    const { container } = render(<PastBracket bracket={{ rounds: 5, series }} teams={[]} season={11} layout="tree" />);
    expect(container.querySelectorAll('.series-box')).toHaveLength(31);
    expect(container.querySelectorAll('.bracket > .bracket-col')).toHaveLength(9);
  });
});
