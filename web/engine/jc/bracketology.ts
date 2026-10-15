import type { Bracket } from '../shared/types';
import { confTables, latestRanking, regularRanking } from './confTourney';
import { isMajor } from './field';
import { computeField } from './fieldMoves';
import { conferenceOf, type JcState } from './state';

/** One First Four game: two teams for the seed of the slot the better-ranked one holds. */
export interface PlayInGame { id: string; teams: [string, string]; seed: number }
/** One group of conferences at the bubble: four teams safely in, eight in the play-in games, four just out. */
export interface GroupBubble {
  firstFourIn: string[];
  /** top = the two games of the four best-ranked of the eight, bottom = the other two. */
  lastEight: { top: PlayInGame[]; bottom: PlayInGame[] };
  firstFourOut: string[];
}

export interface Projection {
  /** The last regular-season or tournament day the ranking was published after. */
  afterDay: number;
  /** One champion per conference: the real one once its tournament is finished, else the best-ranked team. */
  champions: Record<string, { teamId: string; projected: boolean }>;
  seeds: Record<string, number>;
  regions: string[][];
  mmTeams: string[];
  mm: Bracket;
  /** Seed 1..16, four teams each. */
  seedLines: string[][];
  power: GroupBubble;
  other: GroupBubble;
  /** The eight First Four games, power conferences first. */
  playIn: PlayInGame[];
  bids: { conf: string; count: number; teams: string[] }[];
  nit: string[];
  warnings: string[];
}

/** The bracket as it would be picked now. Uses `computeField`, the same code as "Set the fields". Null before the first ranking. */
export function projectBracket(state: JcState, opts: { ranking?: string[] | null; afterDay?: number; ignoreResults?: boolean } = {}): Projection | null {
  const ranking = opts.ranking === undefined ? latestRanking(state) : opts.ranking;
  if (!ranking || ranking.length < 96) return null;
  const confOf = (id: string): string => conferenceOf(state.teams, id);

  const conferences = [...new Set(state.teams.teams.map(t => t.group))].filter((g): g is string => !!g).sort();
  const champions: Projection['champions'] = {};
  for (const conf of conferences) {
    const real = opts.ignoreResults ? null : state.postseason?.conf.find(b => b.id === conf)?.champion ?? null;
    if (real) {
      champions[conf] = { teamId: real, projected: false };
      continue;
    }
    const best = ranking.find(id => confOf(id) === conf);
    if (best) champions[conf] = { teamId: best, projected: true };
  }
  const championIds = Object.values(champions).map(c => c.teamId);
  const rsChampions = state.postseason ? Object.values(state.postseason.rsChampions).flat() : confTables(state).flatMap(t => t.champions);

  const c = computeField(ranking, championIds, rsChampions, confOf);
  const ff = c.firstFour;
  const playIn: PlayInGame[] = ff.pairs.map(p => ({ id: p.id, teams: p.teams, seed: c.seeds[p.teams[0]] }));
  const bubble = (g: 'power' | 'other'): GroupBubble => {
    const games = playIn.filter((_, i) => ff.pairs[i].group === g);
    return { firstFourIn: ff.firstFourIn[g], lastEight: { top: games.slice(0, 2), bottom: games.slice(2, 4) }, firstFourOut: ff.firstFourOut[g] };
  };
  const byConf = new Map<string, string[]>();
  for (const t of [...c.mmTeams, ...playIn.map(g => g.teams[1])]) byConf.set(confOf(t), [...(byConf.get(confOf(t)) ?? []), t]);
  const bids = [...byConf].map(([conf, teams]) => ({ conf, count: teams.length, teams }))
    .sort((a, b) => b.count - a.count || a.conf.localeCompare(b.conf));

  return {
    afterDay: opts.afterDay ?? state.rankings!.snapshots.at(-1)!.afterDay,
    champions,
    seeds: c.seeds,
    regions: c.regions,
    mmTeams: c.mmTeams,
    mm: c.mm,
    seedLines: Array.from({ length: 16 }, (_, i) => c.mmTeams.filter(t => c.seeds[t] === i + 1)),
    power: bubble('power'),
    other: bubble('other'),
    playIn,
    bids,
    nit: c.nitTeams,
    warnings: c.warnings,
  };
}

/** The projection as it stood right before the conference tournaments: the ranking after the regular season, no tournament results. */
export function preTournamentProjection(state: JcState): Projection | null {
  const last = [...(state.rankings?.snapshots ?? [])].filter(x => x.afterDay <= 29).sort((a, b) => a.afterDay - b.afterDay).at(-1);
  if (!last || last.afterDay < 29) return null;
  return projectBracket(state, { ranking: regularRanking(state), afterDay: last.afterDay, ignoreResults: true });
}

export type Outlook = { kind: 'seed'; seed: number; firstFour: boolean } | { kind: 'nit' } | { kind: 'out' };

/** Where a team stood in a projection: on a seed line (and whether it plays the First Four), in the NIT, or out. */
export function teamOutlook(p: Projection, teamId: string): Outlook {
  const game = p.playIn.find(g => g.teams.includes(teamId));
  if (game) return { kind: 'seed', seed: game.seed, firstFour: true };
  if (p.mmTeams.includes(teamId)) return { kind: 'seed', seed: p.seeds[teamId], firstFour: false };
  if (p.nit.includes(teamId)) return { kind: 'nit' };
  return { kind: 'out' };
}

/** The fields as saved (picked by "Set the fields" and any swaps), in the shape of the projection so the Field tab can look like Bracketology. */
export function fieldProjection(state: JcState): Projection | null {
  const ps = state.postseason;
  const field = ps?.field;
  if (!ps || !field || !ps.mm) return null;
  const ranking = latestRanking(state) ?? [];
  const rank = new Map(ranking.map((t, i) => [t, i]));
  const byRank = (a: string, b: string): number => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity);
  const confOf = (id: string): string => conferenceOf(state.teams, id);
  const ff = field.mm.firstFour;
  const challengers = ff.map(g => g.teams[1]);
  const inMm = new Set([...field.mm.teams, ...challengers]);
  const standIns = new Set(ff.map(g => g.teams[0]));
  const champions: Projection['champions'] = {};
  for (const b of ps.conf) if (b.champion) champions[b.id] = { teamId: b.champion, projected: false };
  const playIn: PlayInGame[] = ff.map(g => ({ id: g.id, teams: g.teams, seed: g.seed }));
  const bubble = (group: 'power' | 'other'): GroupBubble => {
    const games = ff.filter(g => g.group === group);
    const playing = games.flatMap(g => g.teams);
    const best = Math.min(...playing.map(t => rank.get(t) ?? Infinity));
    const direct = field.mm.teams.filter(t => !standIns.has(t) && isMajor(confOf(t)) === (group === 'power')).sort(byRank);
    const slice = games.map(g => ({ id: g.id, teams: g.teams, seed: g.seed }));
    return {
      firstFourIn: direct.filter(t => (rank.get(t) ?? Infinity) < best).slice(-4),
      lastEight: { top: slice.slice(0, 2), bottom: slice.slice(2, 4) },
      firstFourOut: ranking.filter(t => !inMm.has(t) && isMajor(confOf(t)) === (group === 'power')).slice(0, 4),
    };
  };
  const byConf = new Map<string, string[]>();
  for (const t of inMm) byConf.set(confOf(t), [...(byConf.get(confOf(t)) ?? []), t]);
  const bids = [...byConf].map(([conf, teams]) => ({ conf, count: teams.length, teams }))
    .sort((a, b) => b.count - a.count || a.conf.localeCompare(b.conf));
  return {
    afterDay: state.rankings?.snapshots.at(-1)?.afterDay ?? 0,
    champions,
    seeds: field.mm.seeds,
    regions: field.mm.regions,
    mmTeams: field.mm.teams,
    mm: ps.mm,
    seedLines: Array.from({ length: 16 }, (_, i) => field.mm.teams.filter(t => field.mm.seeds[t] === i + 1)),
    power: bubble('power'),
    other: bubble('other'),
    playIn,
    bids,
    nit: field.nit.teams,
    warnings: field.warnings,
  };
}
