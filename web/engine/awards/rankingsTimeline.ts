import { powerRankings } from '../playoffs/ranker';
import type { SeasonLeague } from '../season/schedule';
import { records } from '../season/standings';
import type { GameResult } from '../shared/types';

/** The Java refreshed FBA rankings every 20 games; the D2 (64 teams) uses 32, about one game per team. */
export const MARK_EVERY: Record<SeasonLeague, number> = { fba: 20, fbad2: 32 };

/** Game counts that have a ranking so far; the final game count is a mark too once the season is over. */
export function rankingMarks(league: SeasonLeague, played: number, total: number): number[] {
  const step = MARK_EVERY[league];
  const out: number[] = [];
  for (let m = step; m <= played; m += step) out.push(m);
  if (played > 0 && played === total && out[out.length - 1] !== played) out.push(played);
  return out;
}

export interface RankingRow { teamId: string; rank: number | null; w: number; l: number }

/** Power rankings after the first `mark` games, for one group (a D2 league) or everyone (null). Winless teams are unranked, last, by id. */
export function rankingAt(teams: { teamId: string; group: string | null }[], games: GameResult[], mark: number, group: string | null): RankingRow[] {
  const upTo = games.slice(0, mark);
  const members = teams.filter(t => group === null || t.group === group).map(t => t.teamId);
  const inGroup = new Set(members);
  const ranked = powerRankings(upTo).filter(id => inGroup.has(id));
  const recs = records(teams, upTo);
  const rec = (id: string) => ({ w: recs.get(id)?.w ?? 0, l: recs.get(id)?.l ?? 0 });
  const unranked = members.filter(id => !ranked.includes(id)).sort();
  return [
    ...ranked.map((teamId, i) => ({ teamId, rank: i + 1, ...rec(teamId) })),
    ...unranked.map(teamId => ({ teamId, rank: null, ...rec(teamId) })),
  ];
}

/** Rank change since the previous mark: ▲n / ▼n, — for none (or the first mark), NEW if unranked before, '' if unranked now. */
export function movement(prev: number | null | undefined, cur: number | null): string {
  if (cur === null) return '';
  if (prev === undefined) return '—';
  if (prev === null) return 'NEW';
  if (prev === cur) return '—';
  return prev > cur ? `▲${prev - cur}` : `▼${cur - prev}`;
}
