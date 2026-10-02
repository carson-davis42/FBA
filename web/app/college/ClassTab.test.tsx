// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RecruitingResult, RecruitingState } from '../../engine/college/state';
import { CLASS_DRAFT, collegeBaseState, collegeClassState } from '../../engine/college/testFixtures';
import type { RecruitingFile } from '../../engine/shared/types';
import { ClassTab } from './ClassTab';

afterEach(cleanup);

/** Holds the state like the page does: draft edits change the recruiting doc; successful moves replace the state. */
function Harness({ initial, runs }: { initial: RecruitingState; runs: RecruitingResult[] }) {
  const [state, setState] = useState(initial);
  const onDraft = (change: (cur: RecruitingFile) => RecruitingFile) => setState(s => ({ ...s, recruiting: change(s.recruiting) }));
  const onRun = (r: RecruitingResult) => {
    runs.push(r);
    if (r.ok) setState(r.state);
  };
  return <ClassTab state={state} saving={false} onDraft={onDraft} onRun={onRun} />;
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('ClassTab before the class exists', () => {
  it('adds rows, saves a name on blur, changes positions and counts them', () => {
    render(<Harness initial={collegeBaseState()} runs={[]} />);
    expect(screen.getByText('PG 0 · SG 0 · SF 0 · PF 0 · C 0 · 0 total')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Create class' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add recruit' }));
    fireEvent.change(input('Name 1'), { target: { value: 'Zion Carter' } });
    fireEvent.blur(input('Name 1'));
    fireEvent.change(screen.getByLabelText('Position 1'), { target: { value: 'SF' } });
    expect(screen.getByText('PG 0 · SG 0 · SF 1 · PF 0 · C 0 · 1 total')).toBeTruthy();
    expect(input('Name 1').value).toBe('Zion Carter');
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(screen.queryByLabelText('Name 1')).toBeNull();
  });

  it('adds a pasted list and lists back the lines it could not read', () => {
    render(<Harness initial={collegeBaseState()} runs={[]} />);
    fireEvent.change(screen.getByLabelText('Paste list'), { target: { value: 'Zion Carter, PG\nnope\nMalik Ford\tSG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add pasted' }));
    expect(input('Name 1').value).toBe('Zion Carter');
    expect(input('Name 2').value).toBe('Malik Ford');
    expect((screen.getByLabelText('Position 2') as HTMLSelectElement).value).toBe('SG');
    expect(within(screen.getByRole('list', { name: "Lines that weren't added" })).getByText('nope')).toBeTruthy();
    expect((screen.getByLabelText('Paste list') as HTMLTextAreaElement).value).toBe('nope');
  });

  it('creates the class as one move', () => {
    const runs: RecruitingResult[] = [];
    const s = collegeBaseState();
    render(<Harness initial={{ ...s, recruiting: { ...s.recruiting, classDraft: CLASS_DRAFT } }} runs={runs} />);
    expect(screen.getByText('PG 1 · SG 1 · SF 0 · PF 1 · C 0 · 3 total')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create class' }));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ ok: true, label: 'Create S80 class' });
    expect(screen.getByLabelText('Name of Zion Carter')).toBeTruthy();
  });
});

describe('ClassTab after the class exists', () => {
  it('renames and repositions an open recruit, and removes one only without projections or a commitment', () => {
    const runs: RecruitingResult[] = [];
    const s = collegeClassState();
    const recruits = s.recruiting.recruits.map(p =>
      (p.playerId === 'p01915' ? { ...p, projections: { TEX: 1 } } : p.playerId === 'p01916' ? { ...p, committedTo: 'DUKE' } : p));
    render(<Harness initial={{ ...s, recruiting: { ...s.recruiting, recruits } }} runs={runs} />);
    expect((screen.getByRole('button', { name: 'Remove Malik Ford' }) as HTMLButtonElement).disabled).toBe(true);
    expect(input('Name of Eli Grant').disabled).toBe(true);
    expect(screen.getByText((_, el) => el?.tagName === 'TD' && /^Committed:.*Duke$/.test(el.textContent ?? ''))).toBeTruthy();
    expect(screen.getByText('Projected')).toBeTruthy();
    fireEvent.change(input('Name of Zion Carter'), { target: { value: 'Zion Carver' } });
    fireEvent.blur(input('Name of Zion Carter'));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Edit Zion Carver', changed: ['players'] });
    fireEvent.change(screen.getByLabelText('Position of Zion Carver'), { target: { value: 'SG' } });
    expect(runs.at(-1)).toMatchObject({ ok: true, changed: ['recruiting'] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Zion Carver' }));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Remove Zion Carver from the class' });
    expect(screen.queryByLabelText('Name of Zion Carver')).toBeNull();
  });
});
