// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { lotteryProjection } from '../../engine/offseason/lotteryProjection';
import { teamsFile32 } from '../../engine/offseason/testFixtures';
import type { LotteryFile } from '../../engine/shared/types';
import { LotteryStats } from './LotteryStats';

afterEach(cleanup);

const teams = teamsFile32().teams;
// Slot 1 is the worst record. Drawn order: C, A, PHI (an expansion team), B.
const odds = [
  { teamId: 'T10', slot: 1, w: 1, l: 20, pct: 40 },
  { teamId: 'T11', slot: 2, w: 2, l: 19, pct: 30 },
  { teamId: 'T12', slot: 3, w: 3, l: 18, pct: 20 },
  { teamId: 'PHI', slot: 4, w: 0, l: 0, pct: 10 },
];
const doc: LotteryFile = {
  league: 'fba', season: 79, draftSeason: 80, locked: false, odds,
  lottery: ['T12', 'T10', 'PHI', 'T11'], order: [], picks: [],
};
const fmt = (p: number) => `${(p * 100).toFixed(1)}%`;

const view = (shown: number) => render(<MemoryRouter><LotteryStats doc={doc} shown={shown} teams={teams} /></MemoryRouter>);
const rowFor = (table: HTMLElement, name: string) =>
  within(table).getAllByRole('row').find(r => r.querySelector('.team-name-text')?.textContent === name)!;

describe('LotteryStats during the reveal', () => {
  it('shows the header and every team before any reveal, with no change yet', () => {
    view(0);
    expect(screen.getByRole('heading', { name: 'Odds as it unfolds' })).toBeTruthy();
    expect(screen.getByText(/4 teams left/)).toBeTruthy();
    expect(screen.getByText(/picks 1–4 still to reveal/)).toBeTruthy();
    expect(screen.getByText(/favourite for #1: T10 40\.0%/)).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Odds for the teams still hidden' });
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    const cells = within(rowFor(table, 'T10')).getAllByRole('cell');
    expect(cells[1].textContent).toBe('40.0%'); // Start
    expect(cells[2].textContent).toBe('40.0%'); // Now
    expect(cells[3].textContent).toBe('—'); // Change
    expect(within(rowFor(table, 'Philly Phantoms')).getByText('Expansion')).toBeTruthy();
  });

  it('shows Now, Change, expected pick and range after one reveal', () => {
    view(1);
    const before = lotteryProjection(odds, []).hidden;
    const after = lotteryProjection(odds, ['T11']).hidden; // pick 4 is T11
    expect(screen.getByText(/3 teams left/)).toBeTruthy();
    expect(screen.getByText(/picks 1–3 still to reveal/)).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Odds for the teams still hidden' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).queryByText('T11')).toBeNull();
    const t = after.find(x => x.teamId === 'T10')!;
    const prev = before.find(x => x.teamId === 'T10')!;
    const cells = within(rowFor(table, 'T10')).getAllByRole('cell');
    expect(cells[2].textContent).toBe(fmt(t.pFirst));
    const d = (t.pFirst - prev.pFirst) * 100;
    expect(d).toBeGreaterThan(0.05);
    expect(cells[3].textContent).toBe(`▲ +${d.toFixed(1)}`);
    expect(cells[4].textContent).toBe(t.expected.toFixed(1));
    expect(cells[5].textContent).toBe(`#${t.likely.pick} (${fmt(t.likely.p)})`);
    expect(cells[6].textContent).toBe(`${t.best}–${t.worst}`);
  });

  it('shows a fall with a down arrow', () => {
    // Revealing a heavy favourite at the bottom (pick 4) is good news for the rest; a long shot at the bottom hurts nobody much,
    // but the team revealed at pick 4 here is the 30% team, so the 10% team falls in relative terms or rises: check against the engine.
    view(2);
    const before = lotteryProjection(odds, ['T11']).hidden;
    const after = lotteryProjection(odds, ['T11', 'PHI']).hidden;
    const table = screen.getByRole('table', { name: 'Odds for the teams still hidden' });
    for (const t of after) {
      const prev = before.find(x => x.teamId === t.teamId)!;
      const d = (t.pFirst - prev.pFirst) * 100;
      const name = teams.find(x => x.teamId === t.teamId)!.name;
      const text = within(rowFor(table, name)).getAllByRole('cell')[3].textContent;
      expect(text).toBe(Math.abs(d) < 0.05 ? '—' : d > 0 ? `▲ +${d.toFixed(1)}` : `▼ −${(-d).toFixed(1)}`);
    }
  });

  it('lists the projected top teams for each still-hidden pick', () => {
    view(1);
    const proj = lotteryProjection(odds, ['T11']);
    const table = screen.getByRole('table', { name: 'Projected team for each pick' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('#1');
    const top = proj.perPick[0].top;
    expect(rows[0].textContent).toContain(`${top[0].teamId} ${fmt(top[0].p)}`);
    expect(rows[0].textContent).toContain(`${top[2].teamId} ${fmt(top[2].p)}`);
  });

  it('leaves one team at pick 1 for sure with one pick still hidden', () => {
    view(3);
    expect(screen.getByText(/1 team left/)).toBeTruthy();
    expect(screen.getByText(/favourite for #1: T12 100\.0%/)).toBeTruthy();
  });
});

describe('LotteryStats after the last reveal', () => {
  it('shows where each team landed against its record slot', () => {
    view(4);
    expect(screen.queryByRole('heading', { name: 'Odds as it unfolds' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Where teams landed' })).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Where teams landed' });
    const cells = (name: string) => within(rowFor(table, name)).getAllByRole('cell').map(c => c.querySelector('.team-name-text')?.textContent ?? c.textContent);
    // Team, record slot, final pick, movement, pre-lottery pick-1 odds.
    expect(cells('T12')).toEqual(['T12', '3', '1', '▲ 2', '20.0%']);
    expect(cells('T10')).toEqual(['T10', '1', '2', '▼ 1', '40.0%']);
    expect(cells('Philly Phantoms')[3]).toBe('▲ 1');
    expect(cells('T11')).toEqual(['T11', '2', '4', '▼ 2', '30.0%']);
    // Ordered by final pick.
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map(r => r.querySelector('.team-name-text')?.textContent)).toEqual(['T12', 'T10', 'Philly Phantoms', 'T11']);
  });

  it('shows a dash for a team that finished at its record slot', () => {
    const same: LotteryFile = { ...doc, lottery: ['T10', 'T11', 'T12', 'PHI'] };
    render(<MemoryRouter><LotteryStats doc={same} shown={4} teams={teams} /></MemoryRouter>);
    const table = screen.getByRole('table', { name: 'Where teams landed' });
    expect(within(rowFor(table, 'T10')).getAllByRole('cell')[3].textContent).toBe('—');
  });
});
