import type { GameResult } from '../shared/types';

export interface WcRow { teamId: string; w: number; l: number; pf: number; pa: number }
export interface WcTable { rows: WcRow[]; ties: string[] }

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function rankTable(teams: string[], games: GameResult[], keys: Record<string, number>): WcTable {
  const set = new Set(teams);
  const rows = new Map<string, WcRow>(teams.map(t => [t, { teamId: t, w: 0, l: 0, pf: 0, pa: 0 }]));
  const h2h = new Map<string, number>(); // `${winner}>${loser}` -> wins
  const played = new Set<string>(); // unordered pair key
  const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const gm of games) {
    if (!set.has(gm.home) || !set.has(gm.away)) continue;
    const h = rows.get(gm.home)!;
    const a = rows.get(gm.away)!;
    h.pf += gm.homePts; h.pa += gm.awayPts;
    a.pf += gm.awayPts; a.pa += gm.homePts;
    const homeWon = gm.homePts > gm.awayPts;
    const [win, lose] = homeWon ? [h, a] : [a, h];
    win.w++; lose.l++;
    const k = `${win.teamId}>${lose.teamId}`;
    h2h.set(k, (h2h.get(k) ?? 0) + 1);
    played.add(pair(gm.home, gm.away));
  }
  const diff = (r: WcRow) => r.pf - r.pa;
  const key = (id: string) => keys[id] ?? 0;
  const idx = new Map(teams.map((t, i) => [t, i]));
  const wins = (a: string, b: string) => h2h.get(`${a}>${b}`) ?? 0;

  const sorted = [...rows.values()].sort((x, y) => y.w - x.w || idx.get(x.teamId)! - idx.get(y.teamId)!);
  const out: WcRow[] = [];
  const ties: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j < sorted.length && sorted[j].w === sorted[i].w) j++;
    const run = sorted.slice(i, j);
    i = j;
    if (run.length === 1) { out.push(run[0]); continue; }
    let useH2h = true;
    for (const a of run) for (const b of run) if (a !== b && !played.has(pair(a.teamId, b.teamId))) useH2h = false;
    const h2hScore = new Map(run.map(r => [r.teamId, run.reduce((s, o) => s + (o === r ? 0 : wins(r.teamId, o.teamId)), 0)]));
    const cmp = (x: WcRow, y: WcRow) =>
      (useH2h ? h2hScore.get(y.teamId)! - h2hScore.get(x.teamId)! : 0)
      || diff(y) - diff(x)
      || key(x.teamId) - key(y.teamId)
      || idx.get(x.teamId)! - idx.get(y.teamId)!;
    run.sort(cmp);
    for (let k = 0; k + 1 < run.length; k++) {
      const x = run[k]; const y = run[k + 1];
      if (useH2h && h2hScore.get(x.teamId) !== h2hScore.get(y.teamId)) {
        ties.push(`${x.teamId} over ${y.teamId}: head-to-head ${h2hScore.get(x.teamId)}–${h2hScore.get(y.teamId)}`);
      } else if (diff(x) !== diff(y)) {
        ties.push(`${x.teamId} over ${y.teamId}: point differential ${signed(diff(x))} vs ${signed(diff(y))}`);
      } else {
        ties.push(`${x.teamId} over ${y.teamId}: random draw`);
      }
    }
    out.push(...run);
  }
  return { rows: out, ties };
}
