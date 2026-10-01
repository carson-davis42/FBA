import type { JcRow } from './standings';

/** `champion` once a team has clinched at least a share of the conference title: its conference wins are at least what every rival can still reach. */
export function jcClinch(rows: JcRow[], confGamesTotal = 22): Record<string, 'champion' | null> {
  const out: Record<string, 'champion' | null> = {};
  for (const r of rows) {
    out[r.teamId] = rows.every(o => o.teamId === r.teamId || r.confW >= o.confW + Math.max(0, confGamesTotal - o.confW - o.confL)) ? 'champion' : null;
  }
  return out;
}
