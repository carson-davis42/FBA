import { z } from 'zod';

const int = z.number().int();

export const LeagueId = z.enum(['fba', 'fbad2', 'fbajc', 'fbawc']);
export type LeagueId = z.infer<typeof LeagueId>;

const perLeague = <T extends z.ZodTypeAny>(s: T) => z.object({ fba: s, fbad2: s, fbajc: s, fbawc: s }).strict();

export const Position = z.enum(['PG', 'SG', 'SF', 'PF', 'C']);
export type Position = z.infer<typeof Position>;

export const ClassYear = z.enum(['Fr', 'So', 'Jr', 'Sr']);
export type ClassYear = z.infer<typeof ClassYear>;

export const Player = z.object({
  id: z.string().regex(/^p\d{5}$/),
  name: z.string().min(1).nullable(),
  birthSeason: int.nullable(),
}).strict();
export type Player = z.infer<typeof Player>;

export const PlayersFile = z.object({ nextId: int.positive(), players: z.record(z.string(), Player) }).strict();
export type PlayersFile = z.infer<typeof PlayersFile>;

export const Badge = z.object({ bg: z.string(), fg: z.string() }).strict();
export type Badge = z.infer<typeof Badge>;

export const Team = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  abbr: z.string().min(1),
  group: z.string().nullable(),
  logoFolder: z.string().nullable(),
  badge: Badge,
}).strict();
export type Team = z.infer<typeof Team>;

export const TeamsFile = z.object({ league: LeagueId, teams: z.array(Team) }).strict();
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
  restricted: z.boolean().optional(),
}).strict();
export type RosterEntry = z.infer<typeof RosterEntry>;

export const RostersFile = z.object({
  league: LeagueId,
  season: int,
  locked: z.boolean(),
  teams: z.record(z.string(), z.array(RosterEntry)),
}).strict();
export type RostersFile = z.infer<typeof RostersFile>;

export const Champion = z.object({
  title: z.string(),
  champion: z.string(),
  runnerUp: z.string().nullable(),
  score: z.string().nullable(),
}).strict();
export type Champion = z.infer<typeof Champion>;

export const SummaryFile = z.object({
  league: LeagueId,
  season: int,
  locked: z.boolean(),
  host: z.string().nullable(),
  champions: z.array(Champion),
}).strict();
export type SummaryFile = z.infer<typeof SummaryFile>;

export const GameResult = z.object({
  gameNo: int.positive(),
  home: z.string(),
  away: z.string(),
  homePts: int.nonnegative(),
  awayPts: int.nonnegative(),
}).strict();
export type GameResult = z.infer<typeof GameResult>;

export const ResultsFile = z.object({ league: LeagueId, season: int, locked: z.boolean(), games: z.array(GameResult) }).strict();
export type ResultsFile = z.infer<typeof ResultsFile>;

export const CalendarStep = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['offseason', 'league']),
  league: LeagueId.nullable(),
  sub: z.boolean(),
  done: z.boolean(),
}).strict();
export type CalendarStep = z.infer<typeof CalendarStep>;

export const CalendarFile = z.object({ season: int, steps: z.array(CalendarStep) }).strict();
export type CalendarFile = z.infer<typeof CalendarFile>;

export const MetaFile = z.object({ currentSeason: int, rosterSeason: perLeague(int), lastSeason: perLeague(int) }).strict();
export type MetaFile = z.infer<typeof MetaFile>;

const bareName = z.string().min(1).refine(s => !/[\\/]/.test(s) && s !== '.' && s !== '..', 'must be a bare file or folder name');

export const LogoEntry = z.object({
  file: bareName.refine(s => /\.png$/i.test(s), 'must be a .png file'),
  from: int.nullable(),
  to: int.nullable(),
  variant: int,
}).strict();
export type LogoEntry = z.infer<typeof LogoEntry>;

export const LogoManifest = z.object({ folders: z.record(bareName, z.array(LogoEntry)) }).strict();
export type LogoManifest = z.infer<typeof LogoManifest>;

const playerId = z.string().regex(/^p\d{5}$/);

export const FreeAgent = z.object({
  playerId,
  position: Position,
  age: int.nullable(),
  rating: int.nullable(),
  rookie: z.boolean(),
  note: z.string(),
}).strict();
export type FreeAgent = z.infer<typeof FreeAgent>;

export const FreeAgentsFile = z.object({ league: z.literal('fba'), season: int, locked: z.boolean(), players: z.array(FreeAgent) }).strict();
export type FreeAgentsFile = z.infer<typeof FreeAgentsFile>;

export const ReservePlayer = z.object({
  playerId, position: Position, age: int.nullable(), rating: int.nullable(),
  /** Set when the player came from FBA free agency this offseason. */
  fromFba: z.literal(true).optional(),
}).strict();
export type ReservePlayer = z.infer<typeof ReservePlayer>;

export const ReservesFile = z.object({ league: z.literal('fbad2'), season: int, locked: z.boolean(), players: z.array(ReservePlayer) }).strict();
export type ReservesFile = z.infer<typeof ReservesFile>;

export const PickCondition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('top'), n: int.min(1) }).strict(),
  z.object({ kind: z.literal('lottery') }).strict(),
  z.object({ kind: z.literal('swap'), otherTeam: z.string().min(1), betterTo: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('custom'), text: z.string().min(1) }).strict(),
]);
export type PickCondition = z.infer<typeof PickCondition>;

export const PickRoll = z.object({ fromSeason: int, reason: z.enum(['protected', 'already-owed']) }).strict();
export type PickRoll = z.infer<typeof PickRoll>;

export const PickObligation = z.object({
  id: z.string().min(1),
  season: int,
  originalTeam: z.string().min(1),
  owner: z.string().min(1),
  condition: PickCondition,
  originalCondition: PickCondition,
  originSeason: int,
  priority: int.positive(),
  rolls: z.array(PickRoll),
  note: z.string(),
}).strict();
export type PickObligation = z.infer<typeof PickObligation>;

export const PicksFile = z.object({ league: z.literal('fba'), obligations: z.array(PickObligation) }).strict();
export type PicksFile = z.infer<typeof PicksFile>;

export const TransactionType = z.enum(['signed', 'resigned', 'released', 'cut', 'trade', 'edit', 'fa-closed', 'drafted', 'd2-pool', 'd2-ratings']);
export type TransactionType = z.infer<typeof TransactionType>;

export const TransactionEntry = z.object({
  seq: int.positive(),
  batchId: z.string().min(1),
  type: TransactionType,
  teams: z.array(z.string()),
  lines: z.array(z.string().min(1)),
}).strict();
export type TransactionEntry = z.infer<typeof TransactionEntry>;

export const TransactionsFile = z.object({ league: LeagueId, season: int, entries: z.array(TransactionEntry) }).strict();
export type TransactionsFile = z.infer<typeof TransactionsFile>;

const d2Rating = int.min(1).max(99);

export const RatingBreakdown = z.object({ age: int, perf: int, luck: int }).strict();
export type RatingBreakdown = z.infer<typeof RatingBreakdown>;

export const D2RatingRow = z.object({
  playerId,
  position: Position,
  age: int.nullable(),
  /** D2 team id, or null for Reserves. */
  team: z.string().min(1).nullable(),
  oldRating: int.nullable(),
  suggested: d2Rating.nullable(),
  breakdown: RatingBreakdown.nullable(),
  /** The new rating; starts equal to `suggested`. */
  rating: d2Rating.nullable(),
}).strict();
export type D2RatingRow = z.infer<typeof D2RatingRow>;

export const D2RatingsFile = z.object({ league: z.literal('fbad2'), season: int, locked: z.boolean(), players: z.array(D2RatingRow) }).strict();
export type D2RatingsFile = z.infer<typeof D2RatingsFile>;

const idList = z.array(playerId);

export const D2PoolFile = z.object({
  league: z.literal('fbad2'),
  season: int,
  locked: z.boolean(),
  /** Every pool player at each position, best first. */
  order: z.object({ PG: idList, SG: idList, SF: idList, PF: idList, C: idList }).strict(),
}).strict();
export type D2PoolFile = z.infer<typeof D2PoolFile>;

export const D2Pick = z.object({ teamId: z.string().min(1), playerId: playerId.nullable(), position: Position.nullable() }).strict();
export type D2Pick = z.infer<typeof D2Pick>;

export const D2DraftFile = z.object({
  league: z.literal('fbad2'),
  season: int,
  locked: z.boolean(),
  /** One team id per open slot, in pick order. */
  tickets: z.array(z.string().min(1)),
  /** The draft-pool player ids, fixed when the pool locks. They stay in Reserves until picked. */
  pool: idList,
  picks: z.array(D2Pick),
}).strict();
export type D2DraftFile = z.infer<typeof D2DraftFile>;
