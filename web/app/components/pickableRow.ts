import type { KeyboardEvent, MouseEvent } from 'react';

/**
 * Props that make a table row click-to-select (and Enter / Space when focused), as the awards lists use to choose a winner.
 * A click on a link or button inside the row keeps its own meaning. Pass null when the row can't be picked.
 */
export function pickableRow(onPick: (() => void) | null, extraClass = ''): {
  className?: string; tabIndex?: number; title?: string; onClick?: (e: MouseEvent) => void; onKeyDown?: (e: KeyboardEvent) => void;
} {
  const className = [onPick ? 'pickable' : '', extraClass].filter(Boolean).join(' ') || undefined;
  if (!onPick) return { className };
  return {
    className,
    tabIndex: 0,
    title: 'Click to select as the winner',
    onClick: e => { if (!(e.target as HTMLElement).closest('a,button')) onPick(); },
    onKeyDown: e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onPick(); } },
  };
}
