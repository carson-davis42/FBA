import type { SortThProps } from './useSort';

export function SortTh({ label, className, active, dir, onSort }: SortThProps & { label: string; className?: string }) {
  return (
    <th className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-btn" onClick={onSort}>
        {label}
        <span className="sort-arrow" aria-hidden="true">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}
