import type { z } from 'zod';
import {
  AllStarFile, AwardsFile, CalendarFile, D2DraftFile, D2PoolFile, FreeAgentsFile, LogoManifest, MetaFile, PicksFile, PlayersFile, PlayoffsFile, RankingFile, RatingPauseFile, RecruitingFile, ReservesFile, ResultsFile,
  RostersFile, ScheduleFile, SummaryFile, TeamsFile, TransactionsFile,
} from './types';

const L = '(fba|fbad2|fbajc|fbawc)';
const S = 'S[1-9]\\d*';

const RULES: [RegExp, z.ZodTypeAny][] = [
  [/^players\.json$/, PlayersFile],
  [/^meta\.json$/, MetaFile],
  [/^calendar\.json$/, CalendarFile],
  [/^logos\/manifest\.json$/, LogoManifest],
  [/^leagues\/fba\/picks\.json$/, PicksFile],
  [new RegExp(`^leagues/${L}/teams\\.json$`), TeamsFile],
  [new RegExp(`^leagues/${L}/${S}/rosters\\.json$`), RostersFile],
  [new RegExp(`^leagues/${L}/${S}/summary\\.json$`), SummaryFile],
  [new RegExp(`^leagues/${L}/${S}/results\\.json$`), ResultsFile],
  [new RegExp(`^leagues/${L}/${S}/transactions\\.json$`), TransactionsFile],
  [new RegExp(`^leagues/fba/${S}/freeAgents\\.json$`), FreeAgentsFile],
  [new RegExp(`^leagues/fbad2/${S}/reserves\\.json$`), ReservesFile],
  [new RegExp(`^leagues/fbad2/${S}/ratings\\.json$`), RankingFile],
  [new RegExp(`^leagues/fbad2/${S}/pool\\.json$`), D2PoolFile],
  [new RegExp(`^leagues/fbad2/${S}/draft\\.json$`), D2DraftFile],
  [new RegExp(`^leagues/fbajc/${S}/recruiting\\.json$`), RecruitingFile],
  [new RegExp(`^leagues/(fba|fbad2)/${S}/schedule\\.json$`), ScheduleFile],
  [new RegExp(`^leagues/(fba|fbad2)/${S}/playoffs\\.json$`), PlayoffsFile],
  [new RegExp(`^leagues/(fba|fbad2)/${S}/awards\\.json$`), AwardsFile],
  [new RegExp(`^leagues/fba/${S}/ratingPause-[1-9]\\d*\\.json$`), RatingPauseFile],
  [new RegExp(`^leagues/fba/${S}/allstar\\.json$`), AllStarFile],
];

export function schemaForPath(rel: string): z.ZodTypeAny | null {
  for (const [re, schema] of RULES) if (re.test(rel)) return schema;
  return null;
}

const META = new RegExp(`^leagues/${L}/(?:S([1-9]\\d*)/)?`);

/** A document stored under leagues/<league>/[S<n>/] must carry the same league (and season, when it has one). */
export function pathAgreementProblem(rel: string, doc: unknown): string | null {
  const m = rel.match(META);
  if (!m || typeof doc !== 'object' || doc === null) return null;
  const d = doc as { league?: unknown; season?: unknown };
  if ('league' in d && d.league !== m[1]) return `${rel}: league "${String(d.league)}" doesn't match the path`;
  if (m[2] && 'season' in d && d.season !== Number(m[2])) return `${rel}: season ${String(d.season)} doesn't match the path`;
  return null;
}
