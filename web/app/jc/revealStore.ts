import { bracketResults } from '../../engine/jc/bracket';
import { fieldFingerprint, revealPlan } from '../../engine/jc/reveal';
import type { JcState } from '../../engine/jc/state';

const KEY = (season: number): string => `fba.jc.reveal.S${season}`;

/** How many reveal steps this browser has shown for the current field (0 when none, or when the field has changed since). */
export function revealCount(state: JcState): number {
  const field = state.postseason?.field;
  if (!field) return 0;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY(state.season)) ?? 'null') as { fp?: string; n?: number } | null;
    return saved && saved.fp === fieldFingerprint(field) && typeof saved.n === 'number' ? Math.min(saved.n, revealPlan(field).length) : 0;
  } catch {
    return 0;
  }
}

export function setRevealCount(state: JcState, n: number): void {
  const field = state.postseason?.field;
  if (!field) return;
  try {
    // `done` outlives a swap (a changed fingerprint): only a re-draw starts the reveal again.
    localStorage.setItem(KEY(state.season), JSON.stringify({ fp: fieldFingerprint(field), n, done: n >= revealPlan(field).length }));
  } catch { /* storage unavailable: the reveal just restarts on reload */ }
}

/** A re-draw of the fields starts the reveal again. */
export function clearReveal(season: number): void {
  try { localStorage.removeItem(KEY(season)); } catch { /* nothing to clear */ }
}

function revealDone(season: number): boolean {
  try {
    return (JSON.parse(localStorage.getItem(KEY(season)) ?? 'null') as { done?: boolean } | null)?.done === true;
  } catch {
    return false;
  }
}

/** Whether the field may be shown everywhere: its reveal is finished, or a tournament game has already been played. */
export function fieldRevealed(state: JcState): boolean {
  const ps = state.postseason;
  if (!ps?.field) return false;
  if (bracketResults(ps.nit).length + bracketResults(ps.mm).length > 0) return true;
  return revealDone(state.season) || revealCount(state) >= revealPlan(ps.field).length;
}

/** Marks the reveal finished (the "Skip to the end" button, and tests). */
export function markRevealed(state: JcState): void {
  const field = state.postseason?.field;
  if (field) setRevealCount(state, revealPlan(field).length);
}
