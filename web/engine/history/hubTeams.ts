import type { SummaryFile } from '../shared/types';

/** The four teams that played the conference finals (the FBA's last four); a season without a bracket gives its champion and runner-up. */
export function fbaSemifinalists(s: SummaryFile): string[] {
  const cf = (s.bracket?.series ?? []).filter(x => x.id === 'E-CF' || x.id === 'W-CF');
  const fromBracket = cf.flatMap(x => [x.home, x.away]).filter((t): t is string => !!t);
  if (fromBracket.length) return fromBracket;
  return s.champions.flatMap(c => [c.teamId, c.runnerUpId]).filter((t): t is string => !!t);
}

const D2_ORDER = ['PL', 'WL', 'UL', 'IL'];

/** Each D2 league's champion, in league order. */
export function d2LeagueChampions(s: SummaryFile): string[] {
  return s.champions
    .filter(c => c.teamId && c.group)
    .sort((a, b) => D2_ORDER.indexOf(a.group!) - D2_ORDER.indexOf(b.group!))
    .map(c => c.teamId!);
}

/** The school names of the two Final Four games of a 64-team March Madness bracket (a transcribed bracket of any other size gives nothing). */
export function jcFinalFour(s: SummaryFile): string[] {
  const b = s.pastBracket;
  if (!b || b.rounds !== 6) return [];
  return b.series.filter(x => x.round === 5).flatMap(x => [x.home?.name, x.away?.name]).filter((n): n is string => !!n);
}
