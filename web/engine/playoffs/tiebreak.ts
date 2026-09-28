import type { TeamRecord } from '../season/standings';

/** One tie the order broke, in plain words, e.g. "MAN over CAR: conference record 37–19 vs 30–26". */
export interface TieNote { teams: string[]; text: string }

export interface TieOptions {
  /** Compare conference wins (FBA teams in the same conference). */
  conference: boolean;
  /** Power rankings, best first. Called only if a tie gets that far. */
  ranks: () => string[];
}

const net = (r: TeamRecord) => r.w - r.l;
const played = (r: TeamRecord) => r.w + r.l;
const diff = (r: TeamRecord) => r.pf - r.pa;
const signed = (x: number) => (x > 0 ? `+${x}` : String(x));

/** Splits a sorted list into runs of neighbours that `same` says are equal. */
function runs<T>(list: T[], same: (a: T, b: T) => boolean): T[][] {
  const out: T[][] = [];
  for (const x of list) {
    const last = out[out.length - 1];
    if (last && same(last[last.length - 1], x)) last.push(x);
    else out.push([x]);
  }
  return out;
}

function note(sorted: TeamRecord[], label: string, value: (r: TeamRecord) => string, firstOnly = false): TieNote {
  const teams = sorted.map(r => r.teamId);
  if (sorted.length === 2) {
    const [a, b] = sorted;
    const vals = firstOnly ? value(a) : `${value(a)} vs ${value(b)}`;
    return { teams, text: `${a.teamId} over ${b.teamId}: ${label} ${vals}` };
  }
  return { teams, text: `${teams.join(', ')}: ${label} ${sorted.map(value).join(', ')}` };
}

/** Each team's record in games against the other tied teams, or null if any of them hasn't played the others. */
function headToHead(group: TeamRecord[]): Map<string, { w: number; l: number }> | null {
  const out = new Map<string, { w: number; l: number }>();
  for (const a of group) {
    let w = 0;
    let l = 0;
    for (const b of group) {
      if (b === a) continue;
      w += a.h2h.get(b.teamId) ?? 0;
      l += b.h2h.get(a.teamId) ?? 0;
    }
    if (w + l === 0) return null;
    out.set(a.teamId, { w, l });
  }
  return out;
}

type Step = 'h2h' | 'diff' | 'rank';

function breakTie(group: TeamRecord[], step: Step, opts: TieOptions, notes: TieNote[]): TeamRecord[] {
  if (group.length < 2) return group;
  if (step === 'h2h') {
    const h = headToHead(group);
    if (h) {
      const pct = (r: TeamRecord) => { const x = h.get(r.teamId)!; return x.w / (x.w + x.l); };
      const sorted = [...group].sort((a, b) => pct(b) - pct(a));
      const parts = runs(sorted, (a, b) => pct(a) === pct(b));
      if (parts.length > 1) {
        notes.push(note(sorted, 'head-to-head', r => `${h.get(r.teamId)!.w}–${h.get(r.teamId)!.l}`, sorted.length === 2));
        return parts.flatMap(p => breakTie(p, 'h2h', opts, notes));
      }
    }
    return breakTie(group, 'diff', opts, notes);
  }
  if (step === 'diff') {
    const sorted = [...group].sort((a, b) => diff(b) - diff(a));
    const parts = runs(sorted, (a, b) => diff(a) === diff(b));
    if (parts.length > 1) {
      notes.push(note(sorted, 'point differential', r => signed(diff(r))));
      return parts.flatMap(p => breakTie(p, 'h2h', opts, notes));
    }
    return breakTie(group, 'rank', opts, notes);
  }
  const ranks = opts.ranks();
  const pos = (r: TeamRecord) => { const i = ranks.indexOf(r.teamId); return i < 0 ? Infinity : i; };
  const sorted = [...group].sort((a, b) => pos(a) - pos(b) || (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));
  notes.push(note(sorted, 'power ranking', r => (pos(r) === Infinity ? 'unranked' : `#${pos(r) + 1}`)));
  return sorted;
}

/**
 * The commissioner's order: overall record (games behind, then fewer games played), conference wins
 * (when `conference`), head-to-head among the tied teams, point differential, power rankings.
 * After any split, each still-tied part restarts at head-to-head.
 */
export function orderTeams(recs: TeamRecord[], opts: TieOptions): { order: TeamRecord[]; notes: TieNote[] } {
  const notes: TieNote[] = [];
  const sorted = [...recs].sort((a, b) => net(b) - net(a) || played(a) - played(b) || (opts.conference ? b.confW - a.confW : 0));
  const order: TeamRecord[] = [];
  for (const block of runs(sorted, (a, b) => net(a) === net(b) && played(a) === played(b))) {
    if (block.length === 1) {
      order.push(block[0]);
      continue;
    }
    const parts = opts.conference ? runs(block, (a, b) => a.confW === b.confW) : [block];
    if (parts.length > 1) notes.push(note(block, 'conference record', r => `${r.confW}–${r.confL}`));
    for (const p of parts) order.push(...breakTie(p, 'h2h', opts, notes));
  }
  return { order, notes };
}

/** FBA Finals home court: is `a` the better team, without the conference step (they're from different conferences)? */
export function betterAcross(a: TeamRecord, b: TeamRecord, ranks: () => string[]): boolean {
  return orderTeams([a, b], { conference: false, ranks }).order[0] === a;
}
