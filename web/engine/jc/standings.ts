import type { GameResult, TeamsFile } from '../shared/types';

export interface JcRow { teamId: string; w: number; l: number; confW: number; confL: number; pf: number; pa: number; rank: number | null }

export interface JcStandingsInput {
  teams: TeamsFile;
  games: GameResult[];
  /** Latest blended ranking, best first, or null before the first snapshot. */
  ranking: string[] | null;
  drawKeys: Record<string, number>;
}

const TOP = 25;

/** One table per conference. Order: conference games back, fewer conference games played, overall win%, ranking (top 25 beats unranked), head-to-head among the tied teams, point differential, stored random draw. */
export function jcStandings(input: JcStandingsInput): { conference: string; rows: JcRow[]; ties: string[] }[] {
  const { teams, games, ranking, drawKeys } = input;
  const groupOf = new Map(teams.teams.map(t => [t.teamId, t.group]));
  const rows = new Map<string, JcRow>();
  for (const t of teams.teams) {
    const pos = ranking ? ranking.indexOf(t.teamId) : -1;
    rows.set(t.teamId, { teamId: t.teamId, w: 0, l: 0, confW: 0, confL: 0, pf: 0, pa: 0, rank: pos >= 0 && pos < TOP ? pos + 1 : null });
  }
  const h2h = new Map<string, number>(); // `${winner}|${loser}` -> wins
  for (const gm of games) {
    const h = rows.get(gm.home);
    const a = rows.get(gm.away);
    if (!h || !a) continue;
    h.pf += gm.homePts; h.pa += gm.awayPts;
    a.pf += gm.awayPts; a.pa += gm.homePts;
    const homeWon = gm.homePts > gm.awayPts;
    const win = homeWon ? h : a;
    const loss = homeWon ? a : h;
    win.w++; loss.l++;
    const gh = groupOf.get(gm.home);
    if (gh != null && gh === groupOf.get(gm.away)) { win.confW++; loss.confL++; }
    const k = `${win.teamId}|${loss.teamId}`;
    h2h.set(k, (h2h.get(k) ?? 0) + 1);
  }

  const pct = (w: number, l: number) => (w + l === 0 ? 0 : w / (w + l));
  const rankKey = (r: JcRow) => r.rank ?? Infinity;
  /** Negative when a sorts first, 0 when tied on the pre-head-to-head criteria. */
  const base = (a: JcRow, b: JcRow): number =>
    (b.confW - b.confL) - (a.confW - a.confL)
    || (a.confW + a.confL) - (b.confW + b.confL)
    || pct(b.w, b.l) - pct(a.w, a.l)
    || (rankKey(a) === rankKey(b) ? 0 : rankKey(a) < rankKey(b) ? -1 : 1);

  const names = new Map(teams.teams.map(t => [t.teamId, t.abbr]));
  const confs: string[] = [];
  for (const t of teams.teams) if (t.group != null && !confs.includes(t.group)) confs.push(t.group);

  return confs.map(conference => {
    const members = teams.teams.filter(t => t.group === conference).map(t => rows.get(t.teamId)!);
    members.sort((a, b) => base(a, b));
    const out: JcRow[] = [];
    const ties: string[] = [];
    let i = 0;
    while (i < members.length) {
      let j = i + 1;
      while (j < members.length && base(members[i], members[j]) === 0) j++;
      const grp = members.slice(i, j);
      if (grp.length > 1) {
        const ids = new Set(grp.map(r => r.teamId));
        const hh = (r: JcRow) => {
          let w = 0; let l = 0;
          for (const o of ids) if (o !== r.teamId) { w += h2h.get(`${r.teamId}|${o}`) ?? 0; l += h2h.get(`${o}|${r.teamId}`) ?? 0; }
          return pct(w, l);
        };
        const draw = (r: JcRow) => drawKeys[r.teamId] ?? 0;
        grp.sort((a, b) => hh(b) - hh(a) || (b.pf - b.pa) - (a.pf - a.pa) || draw(a) - draw(b));
        for (let k = 0; k + 1 < grp.length; k++) {
          const a = grp[k]; const b = grp[k + 1];
          if (hh(a) === hh(b) && a.pf - a.pa === b.pf - b.pa) ties.push(`${names.get(a.teamId) ?? a.teamId} over ${names.get(b.teamId) ?? b.teamId}: random draw`);
        }
      }
      out.push(...grp);
      i = j;
    }
    return { conference, rows: out, ties };
  });
}
