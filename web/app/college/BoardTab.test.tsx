// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addProjection, commit } from '../../engine/college/recruiting';
import type { RecruitingResult, RecruitingState } from '../../engine/college/state';
import { collegeBaseState, collegeClassState, collegeCurrentClassState } from '../../engine/college/testFixtures';
import { walkOnProblem } from '../../engine/college/walkOns';
import { BoardTab } from './BoardTab';
import { logoUrl } from '../components/logoUrl';

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
  .map(r => (r as HTMLTableRowElement).cells[1].textContent);
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

const ranks = (table: string) => within(screen.getByRole('table', { name: table })).queryAllByRole('row').slice(1)
  .map(r => (r as HTMLTableRowElement).cells[0].textContent);

describe('BoardTab', () => {
  it('takes the page to the school picker when a projection or commit is started', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<Harness initial={collegeCurrentClassState()} runs={[]} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Add a projection for/ })[0]);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText('Search schools'));
  });

  it('does the same from a portal player\'s row', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const s = collegeCurrentClassState();
    const sample = Object.keys(s.players.players)[0];
    const portal = [{ playerId: sample, position: 'PF' as const, classYear: 'Jr' as const, rating: 70, stars: null, projections: {}, committedTo: null, fromTeam: 'BAY' }];
    render(<Harness initial={{ ...s, recruiting: { ...s.recruiting, portal } }} runs={[]} />);
    const row = within(screen.getByRole('table', { name: 'Transfer portal' })).getAllByRole('row')[1];
    fireEvent.click(within(row).getByRole('button', { name: /^Add a projection for/ }));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText('Search schools'));
  });

  it('links to the transfer portal page', () => {
    render(<Harness initial={collegeCurrentClassState()} runs={[]} />);
    expect(screen.getByRole('link', { name: /Open the transfer portal page/ }).getAttribute('href')).toBe('/league/fbajc/portal');
  });

  it('lists the transfer portal highest rating first, whatever order it is stored in', () => {
    const s = collegeCurrentClassState();
    const mk = (playerId: string, rating: number) => ({ playerId, position: 'PF' as const, classYear: 'Jr' as const, rating, stars: null, projections: {}, committedTo: null, fromTeam: 'BAY' });
    const portal = [mk('p90001', 60), mk('p90002', 90), mk('p90003', 75)];
    const sample = Object.values(s.players.players)[0];
    const players = { ...s.players, players: { ...s.players.players, ...Object.fromEntries(portal.map(x => [x.playerId, { ...sample, name: x.playerId }])) } };
    render(<Harness initial={{ ...s, players, recruiting: { ...s.recruiting, portal } }} runs={[]} />);
    expect(names('Transfer portal')).toEqual(['p90002', 'p90003', 'p90001']);
    expect(ranks('Transfer portal')).toEqual(['1', '2', '3']);
  });

  it('numbers the class and the portal 1, 2, 3 in their own order, and keeps a player\'s rank when the list is filtered', () => {
    const s = collegeCurrentClassState();
    render(<Harness initial={s} runs={[]} />);
    const classRanks = ranks(`Class of S${s.recruiting.classOf}`);
    expect(classRanks).toEqual(s.recruiting.recruits.map((_, i) => String(i + 1)));
    if (s.recruiting.portal.length) expect(ranks('Transfer portal')).toEqual(s.recruiting.portal.map((_, i) => String(i + 1)));
    const last = s.recruiting.recruits.at(-1)!;
    fireEvent.change(screen.getByLabelText('Search names'), { target: { value: names(`Class of S${s.recruiting.classOf}`).at(-1)! } });
    const shown = within(screen.getByRole('table', { name: `Class of S${s.recruiting.classOf}` })).queryAllByRole('row').slice(1);
    expect(shown.length).toBeGreaterThan(0);
    expect((shown[0] as HTMLTableRowElement).cells[0].textContent).toBe(String(s.recruiting.recruits.indexOf(last) + 1));
  });

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
    expect(within(zion).getByText((_, el) => !!el?.classList.contains('tag') && /^67% TEX/.test(el.textContent ?? ''))).toBeTruthy();
    expect(within(zion).getByText((_, el) => !!el?.classList.contains('tag') && /^33% BAY/.test(el.textContent ?? ''))).toBeTruthy();
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
    expect(screen.getByText((_, el) => !!el?.classList.contains('tag') && /^100% TEX/.test(el.textContent ?? ''))).toBeTruthy();
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
    expect(screen.getByText((_, el) => el?.tagName === 'STRONG' && /^Committed:.*Baylor$/.test(el.textContent ?? ''))).toBeTruthy();
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

describe('school logos on the recruiting pages', () => {
  it('shows a school with its logo wherever it appears', async () => {
    // A school with a logo file draws it as an image next to the name.
    const { School } = await import('./School');
    const { render: r } = await import('@testing-library/react');
    const state = { season: 79, teams: { league: 'fbajc', teams: [{ teamId: 'DUKE', name: 'Duke', abbr: 'DUKE', group: 'ACC', logoFolder: 'FBAJC_Final', logoFile: 'Duke.png', badge: { bg: '#000', fg: '#fff' } }] } } as unknown as Parameters<typeof School>[0]['state'];
    const { container } = r(<School state={state} teamId="DUKE" />);
    expect(container.querySelector('img.team-mark')!.getAttribute('src')).toBe(logoUrl('FBAJC_Final', 79, 'Duke.png'));
    expect(container.textContent).toBe('Duke');
    cleanup();
    const unknown = r(<School state={state} teamId="ZZZ" />);
    expect(unknown.container.textContent).toBe('ZZZ');
    expect(unknown.container.querySelector('img')).toBeNull();
  });
});
