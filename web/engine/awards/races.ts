import { playerSeasonStats } from '../season/ratingPause';
import { records } from '../season/standings';
import type { SeasonState } from '../season/state';
import type { AwardId, AwardsFile, Position, RostersFile } from '../shared/types';
import { pointsSavedPerGame, seasonDefense, type DefenseTotals } from './defense';
import { awardScore, raceOdds } from './score';

export const MIN_RACE_GAMES = 5;
export const FBA_AWARDS: AwardId[] = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP'];
export const D2_AWARDS: AwardId[] = ['MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL'];
export const AWARD_LABEL: Record<AwardId, string> = {
  MVP: 'MVP', ROTY: 'ROTY', PPK: 'PPK Award', LP: 'LP Award', MC: 'MC Award', DPOY: 'DPOY', MIP: 'MIP',
  'MVP-PL': 'Premier League MVP', 'MVP-WL': 'World League MVP', 'MVP-UL': 'United League MVP', 'MVP-IL': 'International League MVP',
  'MVP-D2': 'D2 MVP', 'MVP-AM': 'D2-America MVP', 'MVP-EW': 'Euro-West MVP', 'MVP-EE': 'Euro-East MVP', 'MVP-ES': 'Euro-South MVP',
};
export const ALL_FBA_SLOTS = ['G', 'F', 'C', 'ANY', 'ANY'] as const;
export const SLOT_POSITIONS: Record<'G' | 'F' | 'C' | 'ANY', Position[]> = {
  G: ['PG', 'SG'], F: ['SF', 'PF'], C: ['C'], ANY: ['PG', 'SG', 'SF', 'PF', 'C'],
};

export interface RaceRow {
  playerId: string;
  teamId: string;
  position: Position;
  rating: number;
  games: number;
  ppg: number;
  winPct: number;
  /** What this race ranks by: award score, points saved per game (DPOY), or MIP score. */
  score: number;
  /** The award score's three parts: 0.6 × PPG, 0.2 × rating, 0.2 × win% × 100. */
  parts: { ppg: number; rating: number; win: number };
  /** American odds for the top 10; '' below. */
  odds: string;
  defense: { perGame: number; stopRate: number; saved: number } | null;
  mip: { lastRating: number; boost: number; secondSeason: boolean } | null;
}

export interface Race { award: AwardId; label: string; rows: RaceRow[] }

interface Base {
  playerId: string;
  teamId: string;
  position: Position;
  rating: number;
  games: number;
  ppg: number;
  winPct: number;
  restricted: boolean;
  def: DefenseTotals | undefined;
}

export function lastSeasonRatings(r: RostersFile | null): Map<string, number | null> {
  return new Map(Object.values(r?.teams ?? {}).flat().filter(e => e.playerId !== null).map(e => [e.playerId!, e.rating]));
}

/** A rookie is on a restricted (rookie) contract and wasn't on last season's FBA roster. */
export function isRookie(playerId: string, restricted: boolean, last: Map<string, number | null>): boolean {
  return restricted && !last.has(playerId);
}

/** S73 rule: the biggest boost wins, and a boost that ends higher counts for more. */
export function mipScore(boost: number, rating: number): number {
  return boost + (rating - 80) / 5;
}

/** Rated rostered players with at least MIN_RACE_GAMES regular-season games. */
function baseLines(state: SeasonState): Base[] {
  const recs = records(state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), state.results?.games ?? []);
  const stats = playerSeasonStats(state.results);
  const def = seasonDefense(state.results);
  const out: Base[] = [];
  for (const [teamId, entries] of Object.entries(state.rosters.teams)) {
    const r = recs.get(teamId);
    const winPct = r && r.w + r.l ? r.w / (r.w + r.l) : 0.5;
    for (const e of entries) {
      if (e.playerId === null || e.rating === null) continue;
      const s = stats.get(e.playerId);
      if (!s || s.games < MIN_RACE_GAMES) continue;
      out.push({
        playerId: e.playerId, teamId, position: e.position, rating: e.rating, games: s.games, ppg: s.pts / s.games, winPct,
        restricted: e.restricted === true, def: def.get(e.playerId),
      });
    }
  }
  return out;
}

function row(b: Base, score: number, extra: Partial<Pick<RaceRow, 'defense' | 'mip'>> = {}): RaceRow {
  return {
    playerId: b.playerId, teamId: b.teamId, position: b.position, rating: b.rating, games: b.games, ppg: b.ppg, winPct: b.winPct,
    score,
    parts: { ppg: b.ppg * 0.6, rating: b.rating * 0.2, win: b.winPct * 100 * 0.2 },
    odds: '',
    defense: extra.defense ?? null,
    mip: extra.mip ?? null,
  };
}

function ranked(award: AwardId, rows: RaceRow[], keys: (r: RaceRow) => number[]): Race {
  const sorted = [...rows].sort((a, b) => {
    const ka = keys(a);
    const kb = keys(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });
  const odds = raceOdds(sorted.slice(0, 10).map(r => r.score));
  return { award, label: AWARD_LABEL[award], rows: sorted.map((r, i) => ({ ...r, odds: odds[i] ?? '' })) };
}

const byAwardScore = (r: RaceRow) => [r.score, r.ppg, r.rating];

/** Every race for this league, from regular-season results. `lastSeason` is last season's FBA roster (null for the D2). */
export function races(state: SeasonState, lastSeason: RostersFile | null): Race[] {
  const base = baseLines(state);
  const scored = (b: Base) => row(b, awardScore(b.ppg, b.rating, b.winPct));
  if (state.league === 'fbad2') {
    const groupOf = new Map(state.teams.teams.map(t => [t.teamId, t.group]));
    return D2_AWARDS.map(id => ranked(id, base.filter(b => groupOf.get(b.teamId) === id.slice(4)).map(scored), byAwardScore));
  }
  const last = lastSeasonRatings(lastSeason);
  const all = base.map(scored);
  const at = (...pos: Position[]) => all.filter(r => pos.includes(r.position));
  const dpoy = base.filter(b => b.def && b.def.games >= MIN_RACE_GAMES).map(b => {
    const saved = pointsSavedPerGame(b.def!);
    return row(b, saved, { defense: { perGame: b.def!.def / b.def!.games, stopRate: b.def!.def ? b.def!.stops / b.def!.def : 0, saved } });
  });
  const mip = base.filter(b => typeof last.get(b.playerId) === 'number').map(b => {
    const lastRating = last.get(b.playerId) as number;
    const boost = b.rating - lastRating;
    return row(b, mipScore(boost, b.rating), { mip: { lastRating, boost, secondSeason: b.restricted } });
  });
  return [
    ranked('MVP', all, byAwardScore),
    ranked('ROTY', base.filter(b => isRookie(b.playerId, b.restricted, last)).map(scored), byAwardScore),
    ranked('PPK', at('PG', 'SG'), byAwardScore),
    ranked('LP', at('SF', 'PF'), byAwardScore),
    ranked('MC', at('C'), byAwardScore),
    ranked('DPOY', dpoy, r => [r.score, r.rating]),
    ranked('MIP', mip, r => [r.score, r.mip!.boost, r.rating]),
  ];
}

/** Team 1 first: G, F and C are the best at those positions by award score, then the two best left at any position. */
export function suggestAllFba(mvp: Race): NonNullable<AwardsFile['allFba']> {
  const used = new Set<string>();
  const team = () => ALL_FBA_SLOTS.map(slot => {
    const r = mvp.rows.find(x => !used.has(x.playerId) && SLOT_POSITIONS[slot].includes(x.position));
    if (r) used.add(r.playerId);
    return { slot, playerId: r?.playerId ?? null, teamId: r?.teamId ?? null };
  });
  const team1 = team();
  const team2 = team();
  return { team1, team2 };
}
