// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SortTh } from './SortTh';
import { sortRows, useSort } from './useSort';

afterEach(cleanup);

describe('sortRows', () => {
  const rows = [{ n: 'b', v: 2 }, { n: 'a', v: null }, { n: 'c', v: 10 }, { n: 'd', v: 2 }];
  it('sorts numbers numerically, keeps ties stable, puts empties last', () => {
    expect(sortRows(rows, r => r.v, 'desc').map(r => r.n)).toEqual(['c', 'b', 'd', 'a']);
    expect(sortRows(rows, r => r.v, 'asc').map(r => r.n)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('sorts text with localeCompare', () => {
    expect(sortRows(rows, r => r.n, 'asc').map(r => r.n)).toEqual(['a', 'b', 'c', 'd']);
  });
});

function Table() {
  const data = [{ name: 'Zed', pts: 5 }, { name: 'Amy', pts: 9 }];
  const { rows, sortProps } = useSort(data, (r, k) => (k === 'pts' ? r.pts : r.name));
  return (
    <table><thead><tr><SortTh label="Name" {...sortProps('name', 'asc')} /><SortTh label="PTS" className="n" {...sortProps('pts')} /></tr></thead>
      <tbody>{rows.map(r => <tr key={r.name}><td>{r.name}</td></tr>)}</tbody></table>
  );
}

describe('useSort + SortTh', () => {
  it('sorts on click, toggles, and sets aria-sort', () => {
    render(<Table />);
    const names = () => screen.getAllByRole('cell').map(c => c.textContent);
    expect(names()).toEqual(['Zed', 'Amy']);
    fireEvent.click(screen.getByRole('button', { name: /PTS/ }));
    expect(names()).toEqual(['Amy', 'Zed']);
    expect(screen.getByRole('columnheader', { name: /PTS/ }).getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(screen.getByRole('button', { name: /PTS/ }));
    expect(names()).toEqual(['Zed', 'Amy']);
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(names()).toEqual(['Amy', 'Zed']);
    expect(screen.getByRole('columnheader', { name: /Name/ }).getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByRole('columnheader', { name: /PTS/ }).getAttribute('aria-sort')).toBe('none');
  });
});
