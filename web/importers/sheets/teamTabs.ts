const COLUMNS: [string, string][] = [
  ['championships', 'championships'], ['c-ship app', 'finals'], ['conference titles', 'confTitles'], ['fba tourny', 'tournaments'],
  ["mvp", 'MVP'], ['ppk', 'PPK'], ['lp award', 'LP'], ['mc award', 'MC'], ['dpoy', 'DPOY'], ['mip', 'MIP'], ['roty', 'ROTY'], ['hall of famers', 'hallOfFamers'],
];
/** Row 2 of a team history tab: the count under each header; null when the header row isn't there. */
export function parseTeamTabCounts(rows: string[][]): Record<string, number> | null {
  const head = (rows[0] ?? []).map(c => (c ?? '').trim().toLowerCase());
  const out: Record<string, number> = {};
  for (const [label, key] of COLUMNS) {
    const i = head.findIndex(h => h.startsWith(label));
    if (i < 0) return null;
    out[key] = Number((rows[1]?.[i] ?? '').trim() || 0);
  }
  return out;
}
