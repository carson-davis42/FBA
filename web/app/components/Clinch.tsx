import type { ReactNode } from 'react';

/** What a standings row has clinched, shown as a coloured bar on the rank cell (FotMob style) with a legend below. */
export type ClinchKind = 'promoted' | 'relegated' | 'conference' | 'first' | 'playoff' | 'eliminated' | 'qualified' | 'advanced';
type ClinchLeague = 'fba' | 'fbad2' | 'fbawc';

/** Legend order. */
const ORDER: ClinchKind[] = ['qualified', 'advanced', 'conference', 'first', 'playoff', 'promoted', 'relegated', 'eliminated'];

export function clinchLabel(kind: ClinchKind, league: ClinchLeague): string {
  switch (kind) {
    case 'qualified': return 'Qualified';
    case 'advanced': return 'Advanced to knockouts';
    case 'promoted': return 'Promoted';
    case 'relegated': return 'Relegated';
    case 'conference': return 'Conference champion';
    case 'first': return league === 'fba' ? 'Clinched the #1 seed' : 'Clinched first place';
    case 'playoff': return 'Clinched a playoff spot';
    case 'eliminated': return 'Eliminated';
  }
}

/** The one state a row shows: promotion and relegation first, then conference champion, then the clinch marker. */
export function clinchKind(row: { marker?: '*' | 'x' | 'n' | null; status?: '▲' | '▼' | null; conference?: boolean }): ClinchKind | null {
  if (row.status === '▲') return 'promoted';
  if (row.status === '▼') return 'relegated';
  if (row.conference) return 'conference';
  if (row.marker === '*') return 'first';
  if (row.marker === 'x') return 'playoff';
  if (row.marker === 'n') return 'eliminated';
  return null;
}

/** The rank cell, with the clinch bar on its left edge. */
export function RankCell({ kind, league, children }: { kind: ClinchKind | null; league: ClinchLeague; children: ReactNode }) {
  if (!kind) return <td className="rank">{children}</td>;
  const label = clinchLabel(kind, league);
  return (
    <td className={`rank clinch clinch-${kind}`} title={label}>
      <span className="clinch-bar" role="img" aria-label={label} />
      {children}
    </td>
  );
}

/** The colour key for the states that appear, in a fixed order; nothing when none do. */
export function ClinchLegend({ kinds, league }: { kinds: (ClinchKind | null)[]; league: ClinchLeague }) {
  const present = ORDER.filter(k => kinds.includes(k));
  if (present.length === 0) return null;
  return (
    <ul className="clinch-legend" aria-label="Standings key">
      {present.map(k => (
        <li key={k} className={`clinch-${k}`}><span className="clinch-swatch" aria-hidden="true" />{clinchLabel(k, league)}</li>
      ))}
    </ul>
  );
}
