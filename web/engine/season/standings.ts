import type { GameResult, PlayoffsFile } from '../shared/types';
import { powerRankings } from '../playoffs/ranker';
import { orderTeams, type TieNote } from '../playoffs/tiebreak';
import { PLAYOFF_SEEDS } from '../shared/league';
import { DIVISION_GAMES, hasDivisions, PAIRINGS, type ScheduleTeamInfo, type SeasonLeague } from './schedule';

export { PLAYOFF_SEEDS };

export const GROUP_ORDER: Record<SeasonLeague, string[]> = { fba: ['E', 'W'], fbad2: ['PL', 'WL', 'UL', 'IL'] };

/** Games per team and conference games per team, from the real group sizes (each pairing is played home and away). */
export function seasonLength(league: SeasonLeague, teams: ScheduleTeamInfo[]): { games: number; confGames: number } {
  if (hasDivisions(league, teams)) {
    const biggest = (pick: (t: ScheduleTeamInfo) => string | null | undefined) => {
      const size = new Map<string | null | undefined, number>();
      for (const t of teams) size.set(pick(t), (size.get(pick(t)) ?? 0) + 1);
      return Math.max(...size.values());
    };
    const div = biggest(t => t.division);
    const conf = biggest(t => t.group);
    const confGames = (div - 1) * DIVISION_GAMES.division + (conf - div) * DIVISION_GAMES.conference;
    return { games: confGames + (teams.length - conf) * DIVISION_GAMES.cross, confGames };
  }
  const { sameGroup, otherGroup } = PAIRINGS[league];
  const size = new Map<string | null, number>();
  for (const t of teams) size.set(t.group, (size.get(t.group) ?? 0) + 1);
  const [mine = 1] = [...size.values()];
  const same = Math.max(0, mine - 1);
  const other = teams.length - mine;
  const confGames = same * sameGroup * 2;
  return { games: confGames + other * otherGroup * 2, confGames };
}

export interface TeamRecord {
  teamId: string;
  group: string;
  /** FBA division (S80 on); absent in the two-conference format. */
  division?: string;
  w: number;
  l: number;
  confW: number;
  confL: number;
  pf: number;
  pa: number;
  /** Wins against each opponent faced (0 when they've played but this team hasn't won). */
  h2h: Map<string, number>;
  log: ('W' | 'L')[];
}

export interface StandingRow {
  teamId: string;
  group: string;
  division?: string;
  seed: number;
  w: number;
  l: number;
  pct: number;
  gb: number;
  confW: number;
  confL: number;
  diff: number;
  l10: string;
  streak: string;
  marker: '*' | 'x' | 'n' | null;
  /** D2 only: ▲ promoted, ▼ relegated, once certain. */
  status: '▲' | '▼' | null;
  /** 🏆 league champion; C FBA conference champion. */
  badge: '🏆' | 'C' | null;
}

/** Division format: who qualifies from a conference. `teams` is the seed (home-court) order of the 8; divisions list their top 3. */
export interface Qualifiers { teams: string[]; divisions: { division: string; teams: string[] }[]; wildCards: string[] }

export interface StandingsGroup {
  group: string;
  /** The whole group (conference) in order. */
  rows: StandingRow[];
  notes: TieNote[];
  /** Division format only: the conference's divisions in order, the non-top-3 teams in order, and who qualifies. */
  divisions?: { division: string; rows: StandingRow[] }[];
  wildCard?: StandingRow[];
  qualifiers?: Qualifiers;
}

export interface Standings {
  groups: StandingsGroup[];
  /** FBA only: non-playoff teams, worst first. */
  lottery: StandingRow[];
}

export interface ClinchRecord { w: number; l: number; confW: number; confL: number }

export function records(teams: ScheduleTeamInfo[], games: GameResult[]): Map<string, TeamRecord> {
  const out = new Map<string, TeamRecord>();
  for (const t of teams) {
    out.set(t.teamId, { teamId: t.teamId, group: t.group ?? '', ...(t.division ? { division: t.division } : {}), w: 0, l: 0, confW: 0, confL: 0, pf: 0, pa: 0, h2h: new Map(), log: [] });
  }
  for (const g of games) {
    const home = out.get(g.home);
    const away = out.get(g.away);
    if (!home || !away) continue;
    const [winner, loser] = g.homePts > g.awayPts ? [home, away] : [away, home];
    const same = home.group === away.group;
    winner.w++;
    loser.l++;
    if (same) {
      winner.confW++;
      loser.confL++;
    }
    home.pf += g.homePts;
    home.pa += g.awayPts;
    away.pf += g.awayPts;
    away.pa += g.homePts;
    winner.h2h.set(loser.teamId, (winner.h2h.get(loser.teamId) ?? 0) + 1);
    if (!loser.h2h.has(winner.teamId)) loser.h2h.set(winner.teamId, 0);
    winner.log.push('W');
    loser.log.push('L');
  }
  return out;
}

const diffOf = (r: TeamRecord) => r.pf - r.pa;

/** Java Team.isBetterThan with point-differential and team-id fallbacks. Used for the lottery order only. */
export function betterThan(league: SeasonLeague, a: TeamRecord, b: TeamRecord): boolean {
  const gb = ((a.w - b.w) + (b.l - a.l)) / 2;
  if (gb > 0) return true;
  if (gb < 0) return false;
  if (a.w + a.l < b.w + b.l) return true;
  if (a.w + a.l > b.w + b.l) return false;
  if (league === 'fba' && a.group === b.group) {
    if (a.confW > b.confW) return true;
    if (a.confW < b.confW) return false;
  }
  if (a.h2h.has(b.teamId) || b.h2h.has(a.teamId)) {
    const x = a.h2h.get(b.teamId) ?? 0;
    const y = b.h2h.get(a.teamId) ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  if (diffOf(a) !== diffOf(b)) return diffOf(a) > diffOf(b);
  return a.teamId < b.teamId;
}

/** Java updateStandHelp: repeatedly select the best (or, reversed, the worst) remaining team. */
export function javaOrder<T>(list: T[], better: (a: T, b: T) => boolean, reverse = false): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (pool.length) {
    let best = pool[0];
    for (const t of pool) {
      if (reverse ? better(best, t) : !better(best, t)) best = t;
    }
    out.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  return out;
}

const played = (r: ClinchRecord) => r.w + r.l;
const confPlayed = (r: ClinchRecord) => r.confW + r.confL;

/**
 * A tie on both wins and conference wins that games can still decide is open: the later tiebreakers (head-to-head, point differential,
 * power rankings) aren't evaluated here, so neither a clinch nor an elimination is declared. Once both teams have finished, the sorted order
 * is final and settles it.
 */
const openTie = (a: ClinchRecord, b: ClinchRecord, len: { games: number }) => !(played(a) === len.games && played(b) === len.games);

function clinchStar(conf: ClinchRecord[], i: number, len: { games: number; confGames: number }): boolean {
  if (i >= 1) return false;
  const t = conf[i];
  for (let j = 0; j < conf.length; j++) {
    if (j === i) continue;
    const temp = conf[j];
    const maxW = temp.w + (len.games - played(temp));
    if (t.w <= maxW) {
      if (t.w < maxW) return false;
      const maxCW = temp.confW + (len.confGames - confPlayed(temp));
      if (t.confW <= maxCW) {
        if (t.confW < maxCW) return false;
        if (openTie(t, temp, len) || j < i) return false;
      }
    }
  }
  return true;
}

function clinchX(conf: ClinchRecord[], i: number, len: { games: number; confGames: number }, spots = PLAYOFF_SEEDS): boolean {
  if (i >= spots) return false;
  const t = conf[i];
  for (let j = spots; j < conf.length; j++) {
    if (j === i) continue;
    const temp = conf[j];
    const maxW = temp.w + (len.games - played(temp));
    if (t.w <= maxW) {
      if (t.w < maxW) return false;
      const maxCW = temp.confW + (len.confGames - confPlayed(temp));
      if (t.confW <= maxCW) {
        if (t.confW < maxCW) return false;
        if (openTie(t, temp, len) || j < i) return false;
      }
    }
  }
  return true;
}

/** Java clinchN, generalized: the team at `i` can no longer reach the top `spots`. */
function clinchOut(conf: ClinchRecord[], i: number, len: { games: number; confGames: number }, spots: number): boolean {
  if (i <= spots - 1) return false;
  const t = conf[i];
  const maxW = t.w + (len.games - played(t));
  const maxCW = t.confW + (len.confGames - confPlayed(t));
  for (let j = 0; j < Math.min(spots, conf.length); j++) {
    if (j === i) continue;
    const temp = conf[j];
    if (temp.w <= maxW) {
      if (temp.w < maxW) return false;
      if (temp.confW <= maxCW) {
        if (temp.confW < maxCW) return false;
        if (openTie(t, temp, len) || j > i) return false;
      }
    }
  }
  return true;
}

const clinchN = (conf: ClinchRecord[], i: number, len: { games: number; confGames: number }) => clinchOut(conf, i, len, PLAYOFF_SEEDS);

/** The Java marker for the team at `index` of a sorted conference: '*' #1 seed, 'x' playoff spot, 'n' eliminated. */
export function markerFor(conf: ClinchRecord[], index: number, len: { games: number; confGames: number }): '*' | 'x' | 'n' | null {
  if (clinchStar(conf, index, len)) return '*';
  if (clinchX(conf, index, len)) return 'x';
  if (clinchN(conf, index, len)) return 'n';
  return null;
}

function streakOf(log: ('W' | 'L')[]): string {
  if (!log.length) return '—';
  const last = log[log.length - 1];
  let n = 0;
  for (let k = log.length - 1; k >= 0 && log[k] === last; k--) n++;
  return `${last}${n}`;
}

function lastTen(log: ('W' | 'L')[]): string {
  const ten = log.slice(-10);
  return `${ten.filter(x => x === 'W').length}-${ten.filter(x => x === 'L').length}`;
}

const PROMOTE_FROM = ['WL', 'UL', 'IL'];
const RELEGATE_FROM = ['PL', 'WL', 'UL'];

/** D2 promotion/relegation, shown once certain: #1 when first place is clinched, the playoff pick after the league final. */
function statusOf(league: SeasonLeague, group: string, ordered: TeamRecord[], i: number, len: { games: number; confGames: number }, playoffs: PlayoffsFile | null): '▲' | '▼' | null {
  if (league !== 'fbad2') return null;
  if (PROMOTE_FROM.includes(group)) {
    if (i === 0 && clinchStar(ordered, 0, len)) return '▲';
    const winner = playoffs?.series.find(s => s.id === `${group}-F`)?.winner;
    if (winner) {
      const second = winner === ordered[0]?.teamId ? ordered[1]?.teamId : winner;
      if (ordered[i].teamId === second) return '▲';
    }
  }
  if (RELEGATE_FROM.includes(group) && ordered.length > 2 && clinchOut(ordered, i, len, ordered.length - 2)) return '▼';
  return null;
}

function badgeOf(league: SeasonLeague, group: string, teamId: string, playoffs: PlayoffsFile | null): '🏆' | 'C' | null {
  if (!playoffs) return null;
  const won = (id: string) => playoffs.series.find(s => s.id === id)?.winner === teamId;
  if (league === 'fba') return won('FINALS') ? '🏆' : won(`${group}-CF`) ? 'C' : null;
  return won(`${group}-F`) ? '🏆' : null;
}

function toRows(league: SeasonLeague, group: string, ordered: TeamRecord[], len: { games: number; confGames: number }, playoffs: PlayoffsFile | null, marker?: (r: TeamRecord, i: number) => StandingRow['marker']): StandingRow[] {
  const top = ordered[0];
  return ordered.map((r, i) => ({
    teamId: r.teamId,
    group: r.group,
    ...(r.division ? { division: r.division } : {}),
    seed: i + 1,
    w: r.w,
    l: r.l,
    pct: r.w + r.l ? r.w / (r.w + r.l) : 0,
    gb: top ? ((top.w - r.w) + (r.l - top.l)) / 2 : 0,
    confW: r.confW,
    confL: r.confL,
    diff: diffOf(r),
    l10: lastTen(r.log),
    streak: streakOf(r.log),
    marker: marker ? marker(r, i) : markerFor(ordered, i, len),
    status: statusOf(league, group, ordered, i, len, playoffs),
    badge: badgeOf(league, group, r.teamId, playoffs),
  }));
}

/** Division spots per division, wild cards per conference. */
const DIVISION_SPOTS = 3;
const WILD_CARDS = 2;

/**
 * The division format: each division is ordered (top 3 qualify), the 2 best of the rest of the conference are the wild cards.
 * Markers: '*' division title clinched, 'x' top 3 of the division clinched, 'n' only once the regular season is over and the team missed out.
 */
function divisionGroup(
  group: string, recs: TeamRecord[], len: { games: number; confGames: number }, playoffs: PlayoffsFile | null, ranks: () => string[],
): { out: StandingsGroup; records: Map<string, TeamRecord> } {
  const notes: TieNote[] = [];
  const addNotes = (n: TieNote[]) => { for (const x of n) if (!notes.some(y => y.text === x.text)) notes.push(x); };
  const conf = orderTeams(recs, { conference: true, ranks });
  addNotes(conf.notes);
  const codes = [...new Set(recs.map(r => r.division!))];
  const divOrders = codes.map(code => {
    const o = orderTeams(recs.filter(r => r.division === code), { conference: true, ranks });
    addNotes(o.notes);
    return { division: code, order: o.order };
  });
  const top = new Set(divOrders.flatMap(d => d.order.slice(0, DIVISION_SPOTS).map(r => r.teamId)));
  const rest = conf.order.filter(r => !top.has(r.teamId));
  const wild = rest.slice(0, WILD_CARDS);
  const qualified = new Set([...top, ...wild.map(r => r.teamId)]);
  const over = recs.every(r => r.w + r.l >= len.games);
  const byTeam = new Map(recs.map(r => [r.teamId, r]));
  const markers = new Map<string, StandingRow['marker']>();
  for (const d of divOrders) {
    d.order.forEach((r, i) => {
      markers.set(r.teamId, clinchStar(d.order, i, len) ? '*' : clinchX(d.order, i, len, DIVISION_SPOTS) ? 'x' : over && !qualified.has(r.teamId) ? 'n' : null);
    });
  }
  const mark = (r: TeamRecord) => markers.get(r.teamId) ?? null;
  const rowOf = (order: TeamRecord[]) => toRows('fba', group, order, len, playoffs, r => mark(r));
  const seedOrder = orderTeams(recs.filter(r => qualified.has(r.teamId)), { conference: true, ranks });
  addNotes(seedOrder.notes);
  const divisions = divOrders.map(d => ({ division: d.division, rows: rowOf(d.order) }));
  const out: StandingsGroup = {
    group,
    rows: rowOf(conf.order),
    notes,
    divisions,
    wildCard: rowOf(rest),
    qualifiers: {
      teams: seedOrder.order.map(r => r.teamId),
      divisions: divOrders.map(d => ({ division: d.division, teams: d.order.slice(0, DIVISION_SPOTS).map(r => r.teamId) })),
      wildCards: wild.map(r => r.teamId),
    },
  };
  return { out, records: byTeam };
}

export function standings(league: SeasonLeague, teams: ScheduleTeamInfo[], games: GameResult[], len = seasonLength(league, teams), playoffs: PlayoffsFile | null = null): Standings {
  const recs = records(teams, games);
  if (hasDivisions(league, teams)) {
    let rk: string[] | null = null;
    const ranks = () => (rk ??= powerRankings(games));
    const groups = GROUP_ORDER[league].filter(code => teams.some(t => t.group === code)).map(g => divisionGroup(g, [...recs.values()].filter(r => r.group === g), len, playoffs, ranks).out);
    const ok = new Set(groups.flatMap(g => g.qualifiers!.teams));
    const outside = [...recs.values()].filter(r => !ok.has(r.teamId));
    const byId = new Map(groups.flatMap(g => g.rows).map(r => [r.teamId, r]));
    const lottery = javaOrder(outside, (a, b) => betterThan(league, a, b), true).map((r, i) => ({ ...byId.get(r.teamId)!, seed: i + 1 }));
    return { groups, lottery };
  }
  const better = (a: TeamRecord, b: TeamRecord) => betterThan(league, a, b);
  let ranked: string[] | null = null;
  const ranks = () => {
    if (ranked === null) ranked = powerRankings(games);
    return ranked;
  };
  const present = GROUP_ORDER[league].filter(code => teams.some(t => t.group === code));
  const groups = present.map(group => {
    const { order, notes } = orderTeams([...recs.values()].filter(r => r.group === group), { conference: league === 'fba', ranks });
    return { group, rows: toRows(league, group, order, len, playoffs), notes };
  });
  let lottery: StandingRow[] = [];
  if (league === 'fba') {
    const outside = groups.flatMap(g => g.rows.slice(PLAYOFF_SEEDS).map(r => recs.get(r.teamId)!));
    const worstFirst = javaOrder(outside, better, true);
    const byId = new Map(groups.flatMap(g => g.rows).map(r => [r.teamId, r]));
    lottery = worstFirst.map((r, i) => ({ ...byId.get(r.teamId)!, seed: i + 1 }));
  }
  return { groups, lottery };
}
