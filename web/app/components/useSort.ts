import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';
export type SortValue = string | number | null | undefined;
export interface SortThProps { active: boolean; dir: SortDir; onSort: () => void }

/** Stable sort; numbers compare numerically, text with localeCompare; empty values always last. */
export function sortRows<T>(rows: T[], val: (r: T) => SortValue, dir: SortDir): T[] {
  const tagged = rows.map((r, i) => ({ r, i, v: val(r) }));
  tagged.sort((a, b) => {
    const ae = a.v == null || a.v === '';
    const be = b.v == null || b.v === '';
    if (ae || be) return ae === be ? a.i - b.i : ae ? 1 : -1;
    const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v));
    return (dir === 'asc' ? c : -c) || a.i - b.i;
  });
  return tagged.map(t => t.r);
}

/** Click-to-sort for a table. With no key the rows keep their given order. */
export function useSort<T>(rows: T[], get: (row: T, key: string) => SortValue, initialKey: string | null = null, initialDir: SortDir = 'desc') {
  const [key, setKey] = useState<string | null>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const sorted = useMemo(() => (key === null ? rows : sortRows(rows, r => get(r, key), dir)), [rows, key, dir, get]);
  const sortProps = (k: string, firstDir: SortDir = 'desc'): SortThProps => ({
    active: key === k,
    dir,
    onSort: () => {
      if (key === k) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
      else { setKey(k); setDir(firstDir); }
    },
  });
  return { rows: sorted, sortProps };
}
