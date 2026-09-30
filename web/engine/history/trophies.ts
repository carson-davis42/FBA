import { franchiseByAbbr, resolveHistoryTeam } from '../shared/franchises';
import type { FranchisesFile, HallOfFameFile, SummaryFile, Team } from '../shared/types';

export const TROPHY_AWARDS = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP'] as const;

export interface TrophyCase {
  championships: number[]; finals: number[]; confTitles: number[]; tournaments: number[];
  awards: { award: string; playerId: string; season: number }[];
  hallOfFamers: { name: string; playerId: string | null; season: string }[];
}
export interface TrophyInput { summaries: SummaryFile[]; teams: Team[]; franchises: FranchisesFile | null; hallOfFame: HallOfFameFile | null }

const idOf = (input: TrophyInput, name: string | null | undefined, season: number, hint?: string | null): string | null =>
  name ? resolveHistoryTeam(input.teams, input.franchises, name, season, hint)?.team.teamId ?? hint ?? null : hint ?? null;

const uniqueAscending = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);
const HOF_LINE = /^([A-Z]{2,4}(?:\/[A-Z]{2,4})*):\s*(?:(FFL)|S(\d+))/;

/** What a franchise has won, derived from the season summaries, the Hall of Fame and the franchise eras. */
export function trophyCase(teamId: string, input: TrophyInput): TrophyCase {
  const championships: number[] = [];
  const finals: number[] = [];
  const confTitles: number[] = [];
  const tournaments: number[] = [];
  const awards: TrophyCase['awards'] = [];

  for (const s of input.summaries.filter(x => x.league === 'fba')) {
    const final = s.champions.find(c => c.title === 'FBA Champion');
    if (final) {
      if (idOf(input, final.champion, s.season, final.teamId) === teamId) {
        championships.push(s.season);
        finals.push(s.season);
      }
      if (idOf(input, final.runnerUp, s.season, final.runnerUpId) === teamId) finals.push(s.season);
    }

    if (s.confChampions) {
      if ([s.confChampions.E, s.confChampions.W].some(n => idOf(input, n, s.season) === teamId)) confTitles.push(s.season);
    } else if ((s.standings ?? []).some(r => r.rank === 1 && idOf(input, r.name, s.season, r.teamId) === teamId)) {
      confTitles.push(s.season);
    }

    const played = (s.standings ?? []).filter(r => r.playoff !== null);
    if (played.length) {
      if (played.some(r => idOf(input, r.name, s.season, r.teamId) === teamId)) tournaments.push(s.season);
    } else if (s.pastBracket?.series.length) {
      const names = s.pastBracket.series.flatMap(x => [x.home?.name, x.away?.name]);
      if (names.some(n => idOf(input, n, s.season) === teamId)) tournaments.push(s.season);
    } else if (s.bracket) {
      if (s.bracket.seeds.some(seed => seed.teams.includes(teamId))) tournaments.push(s.season);
    }

    for (const a of s.awards ?? []) {
      if (!(TROPHY_AWARDS as readonly string[]).includes(a.award)) continue;
      if ((franchiseByAbbr(input.franchises, a.teamId, s.season)?.teamId ?? a.teamId) === teamId) awards.push({ award: a.award, playerId: a.playerId, season: s.season });
    }
  }

  const order = (a: string) => (TROPHY_AWARDS as readonly string[]).indexOf(a);
  awards.sort((a, b) => a.season - b.season || order(a.award) - order(b.award));

  const hallOfFamers: TrophyCase['hallOfFamers'] = [];
  for (const cls of input.hallOfFame?.classes ?? []) {
    for (const p of cls.inductees) {
      const mine = p.lines.some(line => {
        const m = HOF_LINE.exec(line);
        if (!m) return false;
        const start = m[2] ? 1 : Number(m[3]);
        return m[1].split('/').some(code => franchiseByAbbr(input.franchises, code, start)?.teamId === teamId);
      });
      if (mine) hallOfFamers.push({ name: p.name, playerId: p.playerId, season: cls.season });
    }
  }

  return {
    championships: uniqueAscending(championships),
    finals: uniqueAscending(finals),
    confTitles: uniqueAscending(confTitles),
    tournaments: uniqueAscending(tournaments),
    awards,
    hallOfFamers,
  };
}
