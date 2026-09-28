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

const pts = int.nonnegative();

/** Points per player; games saved from 2b-2b on also carry defensive stats for that player as the defender. */
export const BoxLine = z.object({
  playerId: z.string().min(1),
  pts,
  /** Possessions defended. */
  def: pts.optional(),
  /** Missed shots while defending. */
  stops: pts.optional(),
  /** Points allowed while defending. */
  allowed: pts.optional(),
  /** Expected points an average defender would have allowed on the same shots, in hundredths. */
  exp: pts.optional(),
}).strict();
export type BoxLine = z.infer<typeof BoxLine>;

export const GameResult = z.object({
  gameNo: int.positive(),
  home: z.string(),
  away: z.string(),
  homePts: pts,
  awayPts: pts,
  /** Overtime periods played (absent on imported seasons). */
  ot: pts.optional(),
  /** Points per period: 4 quarters, then one entry per OT. */
  periods: z.object({ home: z.array(pts), away: z.array(pts) }).strict().optional(),
  /** Points per player, in roster order at tip-off. */
  box: z.object({ home: z.array(BoxLine), away: z.array(BoxLine) }).strict().optional(),
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

export const TransactionType = z.enum(['signed', 'resigned', 'released', 'cut', 'trade', 'edit', 'fa-closed', 'drafted', 'd2-pool', 'd2-ratings', 'awards']);
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

const seasonLeague = z.enum(['fba', 'fbad2']);

export const PauseKind = z.enum(['ratings', 'deadline', 'allstar']);
export type PauseKind = z.infer<typeof PauseKind>;

export const SchedulePause = z.object({ afterGame: int.nonnegative(), kind: PauseKind, done: z.boolean() }).strict();
export type SchedulePause = z.infer<typeof SchedulePause>;

export const ScheduleGame = z.object({ gameNo: int.positive(), home: z.string().min(1), away: z.string().min(1) }).strict();
export type ScheduleGame = z.infer<typeof ScheduleGame>;

export const ScheduleFile = z.object({
  league: seasonLeague,
  season: int,
  locked: z.boolean(),
  games: z.array(ScheduleGame),
  /** In the order they must be finished; several pauses may share an afterGame. */
  pauses: z.array(SchedulePause),
}).strict();
export type ScheduleFile = z.infer<typeof ScheduleFile>;

export const RatingPauseRow = z.object({
  playerId,
  teamId: z.string().min(1),
  position: Position,
  oldRating: int,
  games: int.nonnegative(),
  ppg: z.number().nonnegative(),
  perf: int.min(-2).max(2).nullable(),
  suggested: d2Rating.nullable(),
  rating: d2Rating,
}).strict();
export type RatingPauseRow = z.infer<typeof RatingPauseRow>;

export const RatingPauseFile = z.object({
  league: z.literal('fba'),
  season: int,
  afterGame: int.positive(),
  locked: z.boolean(),
  players: z.array(RatingPauseRow),
}).strict();
export type RatingPauseFile = z.infer<typeof RatingPauseFile>;

const die = int.min(1).max(6);
export const Dice = z.tuple([die, die]);
export type Dice = z.infer<typeof Dice>;

/** A sudden-death roll-off: each round records the roll of everyone still tied. */
export const RollOff = z.object({ ids: z.array(z.string().min(1)), rounds: z.array(z.record(z.string(), Dice)) }).strict();
export type RollOff = z.infer<typeof RollOff>;

export const ContestRound = z.object({
  players: idList,
  rolls: z.record(z.string(), z.array(Dice)),
  /** Running totals after this round. */
  totals: z.record(z.string(), int),
  advanced: idList,
  rollOffs: z.array(RollOff),
}).strict();
export type ContestRound = z.infer<typeof ContestRound>;

export const ContestResult = z.object({ rounds: z.array(ContestRound), winner: playerId }).strict();
export type ContestResult = z.infer<typeof ContestResult>;

export const DiceRoll = z.object({ team: int.nonnegative(), playerId, dice: Dice }).strict();
export type DiceRoll = z.infer<typeof DiceRoll>;

/** A dice game between two teams (team numbers are the event's team indexes). rolls[period] = every roll in that period. */
export const TeamGame = z.object({
  teams: z.tuple([int.nonnegative(), int.nonnegative()]),
  rolls: z.array(z.array(DiceRoll)),
  scores: z.tuple([int.nonnegative(), int.nonnegative()]),
  rollOff: RollOff.nullable(),
  winner: int.nonnegative(),
}).strict();
export type TeamGame = z.infer<typeof TeamGame>;

export const AllStarSelections = z.object({
  allStars: idList,
  captains: idList,
  youngStars: idList,
  youngCaptains: idList,
}).strict();
export type AllStarSelections = z.infer<typeof AllStarSelections>;

export const ContestTurn = z.object({
  teamId: z.string().min(1),
  contest: z.enum(['5pt', 'dunk']).nullable(),
  playerId: playerId.nullable(),
}).strict();
export type ContestTurn = z.infer<typeof ContestTurn>;

export const AllStarFile = z.object({
  league: z.literal('fba'),
  season: int,
  locked: z.boolean(),
  selections: AllStarSelections.nullable(),
  /** Captain `first` picks first; picks alternate from there. */
  asgDraft: z.object({ first: z.union([z.literal(0), z.literal(1)]), picks: idList }).strict().nullable(),
  contestDraw: z.object({ order: z.array(z.string().min(1)), turns: z.array(ContestTurn) }).strict().nullable(),
  fivePoint: ContestResult.nullable(),
  dunk: ContestResult.nullable(),
  /** Snake draft over `order` (Young-Star team indexes 0–3). */
  ysgDraft: z.object({ order: z.array(int.min(0).max(3)), picks: idList }).strict().nullable(),
  ysg: z.object({ semis: z.array(TeamGame), final: TeamGame, champion: int.min(0).max(3) }).strict().nullable(),
  asg: z.object({ game: TeamGame, mvp: playerId, mvpRollOff: RollOff.nullable() }).strict().nullable(),
}).strict();
export type AllStarFile = z.infer<typeof AllStarFile>;

const teamRef = z.string().min(1);

export const PlayoffSeries = z.object({
  /** E-R1-1 … E-SF-2, E-CF, FINALS (FBA); PL-R1-1 … PL-F (D2). */
  id: z.string().min(1),
  /** Conference or D2 league; null for the FBA Finals. */
  group: z.string().min(1).nullable(),
  round: int.min(1).max(4),
  /** The team with home court in games 1, 2, 5 and 7 (null until known). */
  home: teamRef.nullable(),
  away: teamRef.nullable(),
  homeSeed: int.min(1).max(8).nullable(),
  awaySeed: int.min(1).max(8).nullable(),
  homeWins: int.min(0).max(4),
  awayWins: int.min(0).max(4),
  winner: teamRef.nullable(),
  next: z.string().min(1).nullable(),
}).strict();
export type PlayoffSeries = z.infer<typeof PlayoffSeries>;

/** A playoff game: `gameNo` counts playoff games in play order; home/away are that game's actual host and visitor. */
export const PlayoffGame = GameResult.extend({ seriesId: z.string().min(1), gameInSeries: int.min(1).max(7) }).strict();
export type PlayoffGame = z.infer<typeof PlayoffGame>;

export const PromotionLine = z.object({ league: z.string().min(1), promoted: z.array(teamRef), relegated: z.array(teamRef) }).strict();
export type PromotionLine = z.infer<typeof PromotionLine>;

export const PlayoffsFile = z.object({
  league: seasonLeague,
  season: int,
  locked: z.boolean(),
  seeds: z.array(z.object({ group: z.string().min(1), teams: z.array(teamRef).length(8), notes: z.array(z.string()) }).strict()),
  series: z.array(PlayoffSeries),
  /** The Java rotation: unfinished series with both teams known, front first. */
  queue: z.array(z.string().min(1)),
  games: z.array(PlayoffGame),
  outcome: z.object({
    champions: z.array(z.object({ group: z.string().min(1).nullable(), teamId: teamRef, runnerUp: teamRef, score: z.string().min(1) }).strict()),
    /** D2 only. */
    promotion: z.array(PromotionLine).nullable(),
  }).strict().nullable(),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const byId = new Map(doc.series.map(s => [s.id, s]));
  if (byId.size !== doc.series.length) issue('Series ids must be unique');
  for (const s of doc.series) {
    if (s.homeWins === 4 && s.awayWins === 4) issue(`${s.id}: only one side can have 4 wins`);
    const leader = s.homeWins === 4 ? s.home : s.awayWins === 4 ? s.away : null;
    if ((leader === null) !== (s.winner === null) || (leader !== null && s.winner !== leader)) {
      issue(`${s.id}: the winner must be set exactly when a side has 4 wins, and be that side`);
    }
    if (s.next !== null && !byId.has(s.next)) issue(`${s.id}: next series ${s.next} doesn't exist`);
  }
  if (new Set(doc.queue).size !== doc.queue.length) issue('The queue lists a series twice');
  for (const id of doc.queue) {
    const s = byId.get(id);
    if (!s) issue(`The queue lists unknown series ${id}`);
    else if (s.winner !== null || s.home === null || s.away === null) issue(`The queue lists ${id}, which is finished or missing a team`);
  }
  const counts = new Map<string, number>();
  doc.games.forEach((g, k) => {
    if (g.gameNo !== k + 1) issue(`Playoff game ${k + 1} has gameNo ${g.gameNo}`);
    const s = byId.get(g.seriesId);
    if (!s) {
      issue(`Playoff game ${g.gameNo}: unknown series ${g.seriesId}`);
      return;
    }
    const n = (counts.get(g.seriesId) ?? 0) + 1;
    counts.set(g.seriesId, n);
    if (g.gameInSeries !== n) issue(`Playoff game ${g.gameNo}: expected game ${n} of ${g.seriesId}`);
    const pair = [s.home, s.away];
    if (g.home === g.away || !pair.includes(g.home) || !pair.includes(g.away)) issue(`Playoff game ${g.gameNo}: teams don't match ${g.seriesId}`);
  });
  for (const s of doc.series) {
    if ((counts.get(s.id) ?? 0) !== s.homeWins + s.awayWins) issue(`${s.id}: wins don't match its games`);
  }
});
export type PlayoffsFile = z.infer<typeof PlayoffsFile>;

export const AwardId = z.enum(['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP', 'MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL']);
export type AwardId = z.infer<typeof AwardId>;

const FBA_AWARD_IDS: AwardId[] = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP'];
const ALL_FBA_ORDER = ['G', 'F', 'C', 'ANY', 'ANY'] as const;

export const AllFbaSlot = z.object({
  slot: z.enum(['G', 'F', 'C', 'ANY']),
  playerId: z.string().min(1).nullable(),
  teamId: z.string().min(1).nullable(),
}).strict();
export type AllFbaSlot = z.infer<typeof AllFbaSlot>;

export const AwardsFile = z.object({
  league: seasonLeague,
  season: int,
  locked: z.boolean(),
  awards: z.array(z.object({ award: AwardId, playerId: z.string().min(1), teamId: z.string().min(1) }).strict()),
  /** FBA only. */
  allFba: z.object({ team1: z.array(AllFbaSlot).length(5), team2: z.array(AllFbaSlot).length(5) }).strict().nullable(),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const ids = doc.awards.map(a => a.award);
  if (new Set(ids).size !== ids.length) issue('Each award can only be given once');
  for (const id of ids) {
    if ((doc.league === 'fba') !== FBA_AWARD_IDS.includes(id)) issue(`${id} isn't an ${doc.league === 'fba' ? 'FBA' : 'D2'} award`);
  }
  if (doc.league === 'fbad2' && doc.allFba !== null) issue('The D2 has no All-FBA teams');
  if (doc.allFba) {
    const seen = new Set<string>();
    for (const team of [doc.allFba.team1, doc.allFba.team2]) {
      team.forEach((s, k) => {
        if (s.slot !== ALL_FBA_ORDER[k]) issue(`All-FBA slot ${k + 1} must be ${ALL_FBA_ORDER[k]}`);
        if (s.playerId) {
          if (doc.locked && seen.has(s.playerId)) issue(`${s.playerId} is on the All-FBA teams twice`);
          seen.add(s.playerId);
        }
      });
    }
  }
});
export type AwardsFile = z.infer<typeof AwardsFile>;
