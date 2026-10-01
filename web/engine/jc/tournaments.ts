import type { Rng } from '../d2/random';
import type { GameResult } from '../shared/types';

export interface Field {
  id: string;
  name: string;
  teams: string[];
}

export interface TournamentGame {
  gameNo: number;
  home: string;
  away: string;
  tournament: string;
}

export const TOURNAMENT_NAMES: string[] = [
  'Champions Classic', 'Maui Jim Invitational', 'Goodyear Classic', 'Nike Invitational', 'Chick-Fil-A Opener',
  'Fanatics Invitational', 'Cuts Classic', 'Alaska Invitational', 'Panda Express Battle', 'South Beach Tip Off',
  'Battle 4 Atlantis', 'Jimmy V Classic', 'DCB Tip Off', 'Green Gun Tip Off', 'Independence Opener',
  'Fresno Face off', 'Sunshine Slam', 'Cancun Challenge', 'Emerald Coast Classic', 'Empire Classic',
  'Hall of Fame Classic', 'Dole Derby', 'Lone Star Classic', 'London Invitational', 'Austin Showdown',
  'ESPN Battle', 'Boston Bucks Invitational',
];

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)];
const fieldId = (n: number): string => `PT${String(n).padStart(2, '0')}`;

/** Port of `makePreTournys` (Main.java): a draw of 27 fields of 8. Rules that cannot be met are relaxed. */
export function makeFields(
  input: { confs: Record<string, string[]>; preseasonTop25: string[]; lastChampion: string | null; lastRunnerUp: string | null },
  rng: Rng,
): Field[] {
  const confOf = new Map<string, string>();
  const left = new Map<string, string[]>();
  for (const [c, ids] of Object.entries(input.confs)) {
    left.set(c, [...ids]);
    for (const id of ids) confOf.set(id, c);
  }
  const ranked = input.preseasonTop25.filter(id => confOf.has(id));
  const isRanked = new Set(ranked);

  const has = (id: string): boolean => left.get(confOf.get(id)!)?.includes(id) ?? false;
  const take = (id: string): void => {
    const arr = left.get(confOf.get(id)!)!;
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    const r = ranked.indexOf(id);
    if (r >= 0) ranked.splice(r, 1);
  };
  const add = (cur: string[], id: string | null): void => {
    if (id === null) return;
    cur.push(id);
    take(id);
  };

  const pickRanked = (cur: string[]): string | null => {
    const pool = ranked.filter(has);
    if (!pool.length) return null;
    const used = new Set(cur.map(id => confOf.get(id)));
    const ok = pool.filter(id => !used.has(confOf.get(id)));
    return pick(ok.length ? ok : pool, rng);
  };
  const pickUnranked = (cur: string[]): string | null => {
    const used = new Set(cur.map(id => confOf.get(id)));
    const unrankedIn = (c: string): string[] => left.get(c)!.filter(id => !isRanked.has(id));
    const confs = [...left.keys()];
    let cand = confs.filter(c => unrankedIn(c).length > 0 && !used.has(c));
    if (!cand.length) cand = confs.filter(c => unrankedIn(c).length > 0);
    if (cand.length) return pick(unrankedIn(pick(cand, rng)), rng);
    const any = confs.filter(c => left.get(c)!.length > 0);
    return any.length ? pick(left.get(pick(any, rng))!, rng) : null;
  };
  const fill = (cur: string[]): void => {
    while (cur.length < 8) {
      const id = pickUnranked(cur);
      if (id === null) break;
      add(cur, id);
    }
  };

  const fields: Field[] = [];

  // 1: Champions Classic.
  {
    const cur: string[] = [];
    const { lastChampion: ch, lastRunnerUp: ru } = input;
    let nRanked = 0;
    if (ch && has(ch)) {
      if (isRanked.has(ch)) nRanked++;
      add(cur, ch);
      if (ru && has(ru) && confOf.get(ru) !== confOf.get(ch)) {
        if (isRanked.has(ru)) nRanked++;
        add(cur, ru);
      }
    }
    while (nRanked < 4) {
      const id = pickRanked(cur);
      if (id === null) break;
      add(cur, id);
      nRanked++;
    }
    fill(cur);
    fields.push({ id: fieldId(1), name: TOURNAMENT_NAMES[0], teams: cur });
  }

  // 2-9: a fixed number of top-25 teams, the rest unranked, from distinct conferences.
  [4, 3, 3, 3, 2, 2, 2, 2].forEach((nr, k) => {
    const cur: string[] = [];
    for (let i = 0; i < nr; i++) add(cur, pickRanked(cur));
    fill(cur);
    fields.push({ id: fieldId(k + 2), name: TOURNAMENT_NAMES[k + 1], teams: cur });
  });

  // 10-27: eight distinct conferences, favouring those with the most teams left.
  for (let k = 9; k < 27; k++) {
    const cur: string[] = [];
    while (cur.length < 8) {
      const used = new Set(cur.map(id => confOf.get(id)));
      const withTeams = [...left.keys()].filter(c => left.get(c)!.length > 0);
      if (!withTeams.length) break;
      let eligible = withTeams.filter(c => !used.has(c));
      if (!eligible.length) eligible = withTeams;
      const most = Math.max(...eligible.map(c => left.get(c)!.length));
      const c = pick(eligible.filter(x => left.get(x)!.length === most), rng);
      add(cur, pick(left.get(c)!, rng));
    }
    fields.push({ id: fieldId(k + 1), name: TOURNAMENT_NAMES[k], teams: cur });
  }
  return fields;
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

function winnerLoser(g: GameResult): { w: string; l: string } {
  return g.homePts > g.awayPts ? { w: g.home, l: g.away } : { w: g.away, l: g.home };
}

/** Games for tournament day 1, 2 or 3; days 2 and 3 are built from the earlier results. */
export function dayGames(day: 1 | 2 | 3, fields: Field[], results: GameResult[], firstGameNo: number, _rng: Rng): TournamentGame[] {
  const byPair = new Map<string, GameResult>();
  for (const r of results) byPair.set(pairKey(r.home, r.away), r);
  const out: TournamentGame[] = [];
  let no = firstGameNo;
  const push = (home: string, away: string, tournament: string): void => {
    out.push({ gameNo: no++, home, away, tournament });
  };
  const outcome = (a: string, b: string): { w: string; l: string } => {
    const r = byPair.get(pairKey(a, b));
    if (!r) throw new Error(`missing result for ${a} vs ${b}`);
    return winnerLoser(r);
  };
  for (const f of fields) {
    const t = f.teams;
    const first: [string, string][] = [0, 1, 2, 3].map(i => [t[i], t[7 - i]]);
    if (day === 1) {
      for (const [a, b] of first) push(a, b, f.id);
      continue;
    }
    const r1 = first.map(([a, b]) => outcome(a, b));
    const W = r1.map(x => x.w);
    const L = r1.map(x => x.l);
    if (day === 2) {
      push(W[0], W[1], f.id);
      push(W[2], W[3], f.id);
      push(L[0], L[1], f.id);
      push(L[2], L[3], f.id);
      continue;
    }
    const s1 = outcome(W[0], W[1]);
    const s2 = outcome(W[2], W[3]);
    const s3 = outcome(L[0], L[1]);
    const s4 = outcome(L[2], L[3]);
    push(s1.w, s2.w, f.id);
    push(s1.l, s2.l, f.id);
    push(s3.w, s4.w, f.id);
    push(s3.l, s4.l, f.id);
  }
  return out;
}

export interface TournamentRow {
  teamId: string;
  w: number;
  l: number;
  place: number | null;
}

type SchedGame = { gameNo: number; home: string; away: string; tournament?: string };

/** Records for one tournament; `place` is filled once its placement game (the last four games, in order 1st/3rd/5th/7th) is played. */
export function tournamentTable(field: { id: string; teams: string[] }, scheduleGames: SchedGame[], results: GameResult[]): TournamentRow[] {
  const mine = scheduleGames.filter(g => g.tournament === field.id).sort((a, b) => a.gameNo - b.gameNo);
  const done = new Map(results.map(r => [r.gameNo, r]));
  const rows = new Map<string, TournamentRow>(field.teams.map(id => [id, { teamId: id, w: 0, l: 0, place: null }]));
  for (const g of mine) {
    const r = done.get(g.gameNo);
    if (!r) continue;
    const { w, l } = winnerLoser(r);
    const rw = rows.get(w);
    const rl = rows.get(l);
    if (rw) rw.w++;
    if (rl) rl.l++;
  }
  mine.slice(8, 12).forEach((g, i) => {
    const r = done.get(g.gameNo);
    if (!r) return;
    const { w, l } = winnerLoser(r);
    const rw = rows.get(w);
    const rl = rows.get(l);
    if (rw) rw.place = 2 * i + 1;
    if (rl) rl.place = 2 * i + 2;
  });
  return [...rows.values()].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.w - a.w || a.l - b.l);
}

export function tournamentChampion(field: { id: string; teams: string[] }, scheduleGames: SchedGame[], results: GameResult[]): string | null {
  return tournamentTable(field, scheduleGames, results).find(r => r.place === 1)?.teamId ?? null;
}
