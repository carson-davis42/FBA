import type { WorldCupFile } from '../shared/types';

export interface MvpCandidate { key: string; name: string; teamId: string; generated: boolean; gp: number; ppg: number }
export interface MvpNames { player(id: string): string; team(id: string): string }
export const MVP_MIN_GAMES = 3;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Every player with at least 3 tournament games, best points per game first. */
export function tournamentMvpCandidates(wc: WorldCupFile, names: MvpNames): MvpCandidate[] {
  const totals = new Map<string, { teamId: string; gp: number; pts: number }>();
  const games = [...wc.groupGames, ...wc.knockout.flatMap(k => (k.game ? [k.game] : []))];
  for (const g of games) {
    for (const side of ['home', 'away'] as const) {
      for (const line of g.box?.[side] ?? []) {
        const t = totals.get(line.playerId) ?? { teamId: g[side], gp: 0, pts: 0 };
        t.gp++;
        t.pts += line.pts;
        totals.set(line.playerId, t);
      }
    }
  }
  const rows: { c: MvpCandidate; pts: number }[] = [];
  for (const [key, t] of totals) {
    if (t.gp < MVP_MIN_GAMES) continue;
    const generated = key.includes(':');
    const name = generated ? `${names.team(t.teamId)} ${key.split(':')[1]} (Generated)` : names.player(key);
    rows.push({ c: { key, name, teamId: t.teamId, generated, gp: t.gp, ppg: round1(t.pts / t.gp) }, pts: t.pts });
  }
  return rows.sort((a, b) => b.c.ppg - a.c.ppg || b.pts - a.pts || a.c.name.localeCompare(b.c.name)).map(r => r.c);
}
