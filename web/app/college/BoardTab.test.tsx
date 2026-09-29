// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { addProjection, commit } from '../../engine/college/recruiting';
import type { RecruitingResult, RecruitingState } from '../../engine/college/state';
import { collegeBaseState, collegeClassState, collegeCurrentClassState } from '../../engine/college/testFixtures';
import { walkOnProblem } from '../../engine/college/walkOns';
import { BoardTab } from './BoardTab';

afterEach(cleanup);

function Harness({ initial, runs }: { initial: RecruitingState; runs: RecruitingResult[] }) {
  const [state, setState] = useState(initial);
  const onRun = (r: RecruitingResult) => {
    runs.push(r);
    if (r.ok) setState(r.state);
  };
  return <MemoryRouter><BoardTab state={state} saving={false} onRun={onRun} /></MemoryRouter>;
}

const ok = (r: RecruitingResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
};
const names = (table: string) => within(screen.getByRole('table', { name: table })).queryAllByRole('row').slice(1)
  .map(r => (r as HTMLTableRowElement).cells[0].textContent);
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('BoardTab', () => {
  it('asks for the class first', () => {
    render(<Harness initial={collegeBaseState()} runs={[]} />);
    expect(screen.getByText(/Create the S80 class first/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Go to the class/ }).getAttribute('href')).toBe('/league/fbajc/recruiting?class=80&tab=class');
  });

  it('says the current class is missing, without a link to a Class tab it does not have', () => {
    const s = collegeBaseState();
    render(<Harness initial={{ ...s, recruiting: { ...s.recruiting, season: 78, classOf: 79 } }} runs={[]} />);
    expect(screen.getByText(/The S79 class board doesn't exist yet/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows the counts and the projections as shares', () => {
    let s = collegeClassState();
    for (const t of ['TEX', 'TEX', 'BAY']) s = ok(addProjection(s, 'p01914', t));
    render(<Harness initial={s} runs={[]} />);
    expect(screen.getByText('0 of 3 committed · 0 in the portal')).toBeTruthy();
    expect(names('Class of S80')).toEqual(['Zion Carter', 'Malik Ford', 'Eli Grant']);
    const zion = screen.getByText('Zion Carter').closest('tr')!;
    expect(within(zion).getByText('67% TEX')).toBeTruthy();
    expect(within(zion).getByText('33% BAY')).toBeTruthy();
    expect(screen.getByText('Nobody is in the portal.')).toBeTruthy();
  });

  it('adds a projection with the school picker, and removes one', () => {
    const runs: RecruitingResult[] = [];
    render(<Harness initial={collegeClassState()} runs={runs} />);
    fireEvent.click(button('Add a projection for Zion Carter'));
    const dialog = screen.getByRole('dialog', { name: 'Project Zion Carter' });
    fireEvent.change(within(dialog).getByLabelText('Search schools'), { target: { value: 'tex' } });
    expect(within(dialog).queryByRole('button', { name: 'Baylor' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Texas' }));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Project Zion Carter to Texas' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('100% TEX')).toBeTruthy();
    fireEvent.click(button('Remove a TEX projection for Zion Carter'));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Remove a Texas projection for Zion Carter' });
  });

  it('commits through the picker, listing projected schools first and saying who would leave', () => {
    const runs: RecruitingResult[] = [];
    render(<Harness initial={ok(addProjection(collegeCurrentClassState(), 'p01914', 'BAY'))} runs={runs} />);
    fireEvent.click(button('Commit Zion Carter'));
    const dialog = screen.getByRole('dialog', { name: 'Commit Zion Carter' });
    expect(within(dialog).getAllByRole('heading').map(h => h.textContent)).toEqual(['Commit · Zion Carter', 'Projected', 'Big 12', 'ACC']);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Duke' }));
    expect(within(dialog).getByText('Open spot')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Baylor' }));
    expect(within(dialog).getByText('Jaden Moss (So, 82) will enter the portal')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm commit' }));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Zion Carter commits to Baylor' });
    expect(screen.getByText('Committed: Baylor')).toBeTruthy();
    expect(screen.getByText('1 of 3 committed · 1 in the portal')).toBeTruthy();
    expect(names('Transfer portal')).toEqual(['Jaden Moss']);
  });

  it('refuses in the picker to displace someone who committed this cycle', () => {
    render(<Harness initial={ok(commit(collegeCurrentClassState(), 'p01914', 'BAY', { batchId: 't' }))} runs={[]} />);
    fireEvent.click(button('Commit Jaden Moss'));
    const dialog = screen.getByRole('dialog', { name: 'Commit Jaden Moss' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Baylor' }));
    expect(within(dialog).getByText('Baylor already has Zion Carter committed at PG. Decommit them first')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Confirm commit' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('decommits', () => {
    const runs: RecruitingResult[] = [];
    render(<Harness initial={ok(commit(collegeClassState(), 'p01914', 'BAY', { batchId: 't' }))} runs={runs} />);
    fireEvent.click(button('Decommit Zion Carter'));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Zion Carter decommits from Baylor' });
    expect(button('Commit Zion Carter')).toBeTruthy();
  });

  it('filters by position, commitment and name', () => {
    render(<Harness initial={ok(commit(collegeClassState(), 'p01914', 'DUKE', { batchId: 't' }))} runs={[]} />);
    fireEvent.click(button('SG'));
    expect(names('Class of S80')).toEqual(['Malik Ford']);
    fireEvent.click(button('All'));
    fireEvent.click(button('Committed'));
    expect(names('Class of S80')).toEqual(['Zion Carter']);
    fireEvent.click(button('Uncommitted'));
    expect(names('Class of S80')).toEqual(['Malik Ford', 'Eli Grant']);
    fireEvent.click(button('Everyone'));
    fireEvent.change(screen.getByLabelText('Search names'), { target: { value: 'eli' } });
    expect(names('Class of S80')).toEqual(['Eli Grant']);
  });

  it('is read-only once locked', () => {
    const s = collegeClassState();
    render(<Harness initial={{ ...s, recruiting: { ...s.recruiting, locked: true } }} runs={[]} />);
    expect(screen.queryByRole('button', { name: /^(Commit|Add a projection for) / })).toBeNull();
  });

  describe('walk-ons', () => {
    /** The current class with everyone committed and the FBAJC step current: BAY, TEX and DUKE have 6 open spots. */
    const ready = (): RecruitingState => {
      const s = collegeCurrentClassState();
      return {
        ...s,
        recruiting: { ...s.recruiting, recruits: [], portal: [] },
        calendar: { season: 79, steps: [{ id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: false }] },
      };
    };

    it('fills the open spots with one move', () => {
      const runs: RecruitingResult[] = [];
      render(<Harness initial={ready()} runs={runs} />);
      expect(walkOnProblem(ready())).toBeNull();
      fireEvent.click(button('Fill 6 open spots with walk-ons'));
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ ok: true, label: 'Fill 6 open spots with walk-ons', changed: ['rosters', 'players', 'tx'] });
      expect(button('Fill open spots with walk-ons').disabled).toBe(true);
    });

    it('is disabled with the reason until the FBAJC gate is clear', () => {
      const s = collegeCurrentClassState();
      render(<Harness initial={s} runs={[]} />);
      expect(button('Fill 6 open spots with walk-ons').disabled).toBe(true);
      expect(screen.getByText(walkOnProblem(s)!)).toBeTruthy();
    });

    it('is disabled with the reason when there are no open spots', () => {
      const s = ready();
      const full = { ...s, rosters: { ...s.rosters, teams: Object.fromEntries(Object.entries(s.rosters.teams).map(([t, es]) => [t, es.map(e => (e.playerId === null ? { ...e, playerId: 'p00486', classYear: 'Fr' as const, rating: 60 } : e))])) } };
      render(<Harness initial={full} runs={[]} />);
      expect(button('Fill open spots with walk-ons').disabled).toBe(true);
      expect(screen.getByText('There are no open spots')).toBeTruthy();
    });

    it('is disabled with the reason when the board is locked', () => {
      const s = ready();
      render(<Harness initial={{ ...s, recruiting: { ...s.recruiting, locked: true } }} runs={[]} />);
      expect(button('Fill 6 open spots with walk-ons').disabled).toBe(true);
      expect(screen.getByText('The board is locked')).toBeTruthy();
    });

    it('is not shown on the next class board', () => {
      render(<Harness initial={collegeClassState()} runs={[]} />);
      expect(screen.queryByRole('button', { name: /walk-ons/ })).toBeNull();
    });
  });
});
