import { z } from 'zod';

const int = z.number().int();

export const LeagueId = z.enum(['fba', 'fbad2', 'fbajc', 'fbawc']);
export type LeagueId = z.infer<typeof LeagueId>;

const perLeague = <T extends z.ZodTypeAny>(s: T) => z.object({ fba: s, fbad2: s, fbajc: s, fbawc: s });

export const Position = z.enum(['PG', 'SG', 'SF', 'PF', 'C']);
export type Position = z.infer<typeof Position>;

export const ClassYear = z.enum(['Fr', 'So', 'Jr', 'Sr']);
export type ClassYear = z.infer<typeof ClassYear>;

export const Player = z.object({
  id: z.string().regex(/^p\d{5}$/),
  name: z.string().min(1).nullable(),
  birthSeason: int.nullable(),
});
export type Player = z.infer<typeof Player>;

export const PlayersFile = z.object({ nextId: int.positive(), players: z.record(z.string(), Player) });
export type PlayersFile = z.infer<typeof PlayersFile>;

export const Badge = z.object({ bg: z.string(), fg: z.string() });
export type Badge = z.infer<typeof Badge>;

export const Team = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  abbr: z.string().min(1),
  group: z.string().nullable(),
  logoFolder: z.string().nullable(),
  badge: Badge,
});
export type Team = z.infer<typeof Team>;

export const TeamsFile = z.object({ league: LeagueId, teams: z.array(Team) });
export type TeamsFile = z.infer<typeof TeamsFile>;

export const RosterEntry = z.object({
  playerId: z.string().nullable(),
  position: Position,
  rating: int.nullable(),
  age: int.nullable(),
  points: int,
  contractEnd: int.nullable().optional(),
  contractAmount: z.number().nullable().optional(),
  stars: int.nullable().optional(),
  classYear: ClassYear.nullable().optional(),
});
export type RosterEntry = z.infer<typeof RosterEntry>;

export const RostersFile = z.object({
  league: LeagueId,
  season: int,
  locked: z.boolean(),
  teams: z.record(z.string(), z.array(RosterEntry)),
});
export type RostersFile = z.infer<typeof RostersFile>;

export const Champion = z.object({
  title: z.string(),
  champion: z.string(),
  runnerUp: z.string().nullable(),
  score: z.string().nullable(),
});
export type Champion = z.infer<typeof Champion>;

export const SummaryFile = z.object({
  league: LeagueId,
  season: int,
  locked: z.boolean(),
  host: z.string().nullable(),
  champions: z.array(Champion),
});
export type SummaryFile = z.infer<typeof SummaryFile>;

export const GameResult = z.object({
  gameNo: int.positive(),
  home: z.string(),
  away: z.string(),
  homePts: int.nonnegative(),
  awayPts: int.nonnegative(),
});
export type GameResult = z.infer<typeof GameResult>;

export const ResultsFile = z.object({ league: LeagueId, season: int, locked: z.boolean(), games: z.array(GameResult) });
export type ResultsFile = z.infer<typeof ResultsFile>;

export const CalendarStep = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['offseason', 'league']),
  league: LeagueId.nullable(),
  sub: z.boolean(),
  done: z.boolean(),
});
export type CalendarStep = z.infer<typeof CalendarStep>;

export const CalendarFile = z.object({ season: int, steps: z.array(CalendarStep) });
export type CalendarFile = z.infer<typeof CalendarFile>;

export const MetaFile = z.object({ currentSeason: int, rosterSeason: perLeague(int), lastSeason: perLeague(int) });
export type MetaFile = z.infer<typeof MetaFile>;

const bareName = z.string().min(1).refine(s => !/[\\/]/.test(s) && s !== '.' && s !== '..', 'must be a bare file or folder name');

export const LogoEntry = z.object({
  file: bareName.refine(s => /\.png$/i.test(s), 'must be a .png file'),
  from: int.nullable(),
  to: int.nullable(),
  variant: int,
});
export type LogoEntry = z.infer<typeof LogoEntry>;

export const LogoManifest = z.object({ folders: z.record(bareName, z.array(LogoEntry)) });
export type LogoManifest = z.infer<typeof LogoManifest>;
