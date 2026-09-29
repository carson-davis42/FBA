// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setConsensus } from '../../engine/college/classRanking';
import { rankingDoc, rankName } from '../../engine/rank/testFixtures';
import type { RankingFile } from '../../engine/shared/types';
import { RankingTable } from './RankingTable';

afterEach(cleanup);

const ALL = ['p00002', 'p00001', 'p00003', 'p00006', 'p00004', 'p00005'];
const IN_ORDER = { p00002: 85, p00001: 85, p00003: 80, p00006: 75, p00004: 70, p00005: 65 };

function Harness({ initial, extra = [], onFinish = () => {}, withConsensus = false }: { initial: RankingFile; extra?: string[]; onFinish?: () => void; withConsensus?: boolean }) {
  const [doc, setDoc] = useState(initial);
  return (
    <RankingTable
      doc={doc} name={rankName} teamLabel={t => t ?? 'Reserves'} otherLabel="FBA" onChange={change => setDoc(change)}
      extraBlockers={extra} finishLabel="Finish ratings" onFinish={onFinish} busy={false}
      consensus={withConsensus ? { onSet: (id, v) => setDoc(cur => setConsensus(cur, id, v)) } : undefined}
    />
  );
}

const leftNames = () => within(screen.getByRole('table', { name: "Last season's order" })).queryAllByRole('button').map(b => b.textContent);
const rightNames = () => within(screen.getByRole('table', { name: 'New ranking' })).queryAllByRole('row').slice(1)
  .map(r => (r as HTMLTableRowElement).cells[1].textContent);
const box = (name: string) => screen.getByLabelText(`New rating for ${name}`) as HTMLInputElement;

describe('RankingTable', () => {
  it("lists last season's order with a New divider, and ranks a clicked player next", () => {
    render(<Harness initial={rankingDoc()} />);
    expect(leftNames()).toEqual(['Ben Cole', 'Ada Stone', 'Cal Reyes', 'Finn Lowe', 'Dev Hart', 'Eli Park']);
    const left = screen.getByRole('table', { name: "Last season's order" });
    expect(within(left).getByText('New')).toBeTruthy();
    expect(within(left).getByText('FBA 75')).toBeTruthy();
    expect(within(left).getAllByText('300 pts')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Rank Ada Stone next' }));
    expect(rightNames()).toEqual(['Ada Stone']);
    expect(leftNames()).toEqual(['Ben Cole', 'Cal Reyes', 'Finn Lowe', 'Dev Hart', 'Eli Park']);
  });

  it('sends a ranked player back to their place', () => {
    render(<Harness initial={rankingDoc()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rank Ada Stone next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send Ada Stone back' }));
    expect(rightNames()).toEqual([]);
    expect(leftNames()[1]).toBe('Ada Stone');
  });

  it('takes the rest in order', () => {
    render(<Harness initial={rankingDoc()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take the rest in order' }));
    expect(rightNames()).toEqual(['Ben Cole', 'Ada Stone', 'Cal Reyes', 'Finn Lowe', 'Dev Hart', 'Eli Park']);
    expect(leftNames()).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Take the rest in order' })).toBeNull();
  });

  it('shows empty rating boxes, with a separate suggestion chip, only once everyone is ranked', () => {
    render(<Harness initial={rankingDoc({ order: ['p00002'] })} />);
    expect(screen.queryByLabelText('New rating for Ben Cole')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Take the rest in order' }));
    expect(box('Ben Cole').value).toBe('');
    const chip = screen.getByRole('button', { name: 'Use suggested 90 for Ben Cole' });
    expect(chip.textContent).toBe('suggested 90');
    expect(screen.queryByRole('button', { name: /^Use suggested \d+ for Finn Lowe$/ })).toBeNull();
    fireEvent.click(chip);
    expect(box('Ben Cole').value).toBe('90');
    fireEvent.click(screen.getByRole('button', { name: 'Send Eli Park back' }));
    expect(screen.queryByLabelText('New rating for Ben Cole')).toBeNull();
  });

  it('uses all suggestions without overwriting a typed rating', () => {
    render(<Harness initial={rankingDoc({ order: ALL })} />);
    fireEvent.change(box('Ada Stone'), { target: { value: '84' } });
    fireEvent.blur(box('Ada Stone'));
    fireEvent.click(screen.getByRole('button', { name: 'Use all suggestions' }));
    expect(['Ben Cole', 'Ada Stone', 'Cal Reyes', 'Finn Lowe'].map(n => box(n).value)).toEqual(['90', '84', '80', '']);
  });

  it('flags out-of-order rows and keeps Finish disabled until everyone is rated in order', () => {
    const onFinish = vi.fn();
    render(<Harness initial={rankingDoc({ order: ALL, ratings: { ...IN_ORDER, p00001: 86 } })} onFinish={onFinish} />);
    expect(screen.getByText('#2 Ada Stone (86) is rated above #1 Ben Cole (85)')).toBeTruthy();
    expect(screen.getByTitle('Rated above a player ranked higher')).toBeTruthy();
    const finish = screen.getByRole('button', { name: 'Finish ratings' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
    fireEvent.change(box('Ada Stone'), { target: { value: '84' } });
    fireEvent.blur(box('Ada Stone'));
    expect(screen.queryByTitle('Rated above a player ranked higher')).toBeNull();
    expect(finish.disabled).toBe(false);
    fireEvent.click(finish);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("lists the caller's blockers and keeps Finish disabled for them", () => {
    render(<Harness initial={rankingDoc({ order: ALL, ratings: IN_ORDER })} extra={['Kris Dyer is no longer in the D2 pool']} />);
    expect(screen.getByText('Kris Dyer is no longer in the D2 pool')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Finish ratings' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('filters both columns by position, while taking still appends to the one ranking', () => {
    render(<Harness initial={rankingDoc({ order: ['p00002'] })} />);
    fireEvent.click(screen.getByRole('button', { name: 'C' }));
    expect(leftNames()).toEqual(['Finn Lowe']);
    expect(rightNames()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Rank Finn Lowe next' }));
    fireEvent.click(screen.getByRole('button', { name: 'SG' }));
    expect(leftNames()).toEqual([]);
    expect(rightNames()).toEqual(['Ben Cole']);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(rightNames()).toEqual(['Ben Cole', 'Finn Lowe']);
  });

  it('is read-only once locked', () => {
    render(<Harness initial={rankingDoc({ locked: true, order: ALL, ratings: IN_ORDER })} />);
    for (const name of ['Take the rest in order', 'Use all suggestions', 'Finish ratings']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Send .* back$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Use suggested/ })).toBeNull();
    expect(box('Ben Cole').disabled).toBe(true);
    expect(box('Ben Cole').value).toBe('85');
  });

  describe('with a consensus column', () => {
    const classDoc = (patch: Partial<RankingFile> = {}) => rankingDoc({
      kind: 'college-class', order: ALL, ratings: IN_ORDER, consensusCurve: [98.8, 91, 79.5], consensus: {}, ...patch,
    });
    const cbox = (name: string) => screen.getByLabelText(`Consensus for ${name}`) as HTMLInputElement;
    const headers = () => within(screen.getByRole('table', { name: 'New ranking' })).getAllByRole('columnheader').map(h => h.textContent);

    it('is absent without the prop', () => {
      render(<Harness initial={classDoc()} />);
      expect(headers()).not.toContain('Consensus');
      expect(screen.queryByLabelText('Consensus for Ben Cole')).toBeNull();
    });

    it('shows a Consensus box, the stars and a suggested chip once everyone is ranked', () => {
      render(<Harness initial={classDoc({ consensus: { p00002: 95 } })} withConsensus />);
      expect(headers()).toContain('Consensus');
      expect(cbox('Ben Cole').value).toBe('95');
      expect(cbox('Ada Stone').value).toBe('');
      expect(screen.getByLabelText('5 stars')).toBeTruthy();
      expect(screen.getAllByLabelText(/stars$/)).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Use suggested consensus 91 for Ada Stone' }).textContent).toBe('suggested 91');
      expect(screen.getByRole('button', { name: 'Use suggested consensus 98.8 for Ben Cole' }).textContent).toBe('suggested 98.8');
      fireEvent.click(screen.getByRole('button', { name: 'Use suggested consensus 91 for Ada Stone' }));
      expect(cbox('Ada Stone').value).toBe('91');
      expect(screen.getAllByLabelText('5 stars')).toHaveLength(2);
    });

    it('hides the column until everyone is ranked', () => {
      render(<Harness initial={classDoc({ order: ['p00002'] })} withConsensus />);
      expect(headers()).not.toContain('Consensus');
    });

    it('saves a typed consensus on blur, and clears it when blank', () => {
      render(<Harness initial={classDoc()} withConsensus />);
      fireEvent.change(cbox('Cal Reyes'), { target: { value: '82.25' } });
      fireEvent.blur(cbox('Cal Reyes'));
      expect(cbox('Cal Reyes').value).toBe('82.25');
      expect(screen.getByLabelText('4 stars')).toBeTruthy();
      fireEvent.change(cbox('Cal Reyes'), { target: { value: '' } });
      fireEvent.blur(cbox('Cal Reyes'));
      expect(cbox('Cal Reyes').value).toBe('');
      expect(screen.queryByLabelText('4 stars')).toBeNull();
    });

    it('rejects an out-of-range consensus with a message and does not save it', () => {
      render(<Harness initial={classDoc()} withConsensus />);
      fireEvent.change(cbox('Cal Reyes'), { target: { value: '65' } });
      fireEvent.blur(cbox('Cal Reyes'));
      expect(screen.getByText('Enter a consensus from 70 to 100, with up to 2 decimals')).toBeTruthy();
      expect(screen.queryByLabelText(/stars$/)).toBeNull();
    });

    it('uses all suggestions for the ratings and the consensus, without overwriting', () => {
      render(<Harness initial={classDoc({ ratings: { p00001: 84 }, consensus: { p00002: 96 } })} withConsensus />);
      fireEvent.click(screen.getByRole('button', { name: 'Use all suggestions' }));
      expect(['Ben Cole', 'Ada Stone', 'Cal Reyes'].map(n => cbox(n).value)).toEqual(['96', '91', '79.5']);
      expect(box('Ada Stone').value).toBe('84');
    });

    it('is read-only once locked', () => {
      render(<Harness initial={classDoc({ locked: true, consensus: { p00002: 95 } })} withConsensus />);
      expect(cbox('Ben Cole').disabled).toBe(true);
      expect(screen.queryByRole('button', { name: /^Use suggested consensus/ })).toBeNull();
    });
  });
});
