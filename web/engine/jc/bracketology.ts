import type { Bracket } from '../shared/types';
import { confTables, latestRanking } from './confTourney';
import { isMajor } from './field';
import { computeField } from './fieldMoves';
import { conferenceOf, type JcState } from './state';

/** The last four at-large teams in and the first four out of one group of conferences. */
export interface Bubble { lastFourIn: string[]; firstFourOut: string[] }

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
  /** Power-conference teams are capped: they fill no place after the 51st pick, so the last 13 places go to the other conferences. */
  power: Bubble;
  other: Bubble;
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
  const champSet = new Set(championIds);
  const bubble = (major: boolean): Bubble => ({
    lastFourIn: c.mmTeams.filter(t => !champSet.has(t) && isMajor(confOf(t)) === major).slice(-4),
    firstFourOut: c.leftover.filter(t => isMajor(confOf(t)) === major).slice(0, 4),
  });
  const byConf = new Map<string, string[]>();
  for (const t of c.mmTeams) byConf.set(confOf(t), [...(byConf.get(confOf(t)) ?? []), t]);
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
    power: bubble(true),
    other: bubble(false),
    bids,
    nit: c.nitTeams,
    warnings: c.warnings,
  };
}
