import type { Bracket } from '../shared/types';
import { confTables, latestRanking } from './confTourney';
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
export function projectBracket(state: JcState): Projection | null {
  const ranking = latestRanking(state);
  if (!ranking || ranking.length < 96) return null;
  const confOf = (id: string): string => conferenceOf(state.teams, id);

  const conferences = [...new Set(state.teams.teams.map(t => t.group))].filter((g): g is string => !!g).sort();
  const champions: Projection['champions'] = {};
  for (const conf of conferences) {
    const real = state.postseason?.conf.find(b => b.id === conf)?.champion ?? null;
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
    afterDay: state.rankings!.snapshots.at(-1)!.afterDay,
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
