/** A series or game score for display: an empty score is an em dash, and a hyphen between digits becomes an en dash. */
export function formatScore(s: string | null | undefined): string {
  const t = (s ?? '').trim();
  return t === '' ? '—' : t.replace(/(\d)\s*-\s*(\d)/g, '$1–$2');
}
