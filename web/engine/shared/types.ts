import { z } from 'zod';

const int = z.number().int();

export const LeagueId = z.enum(['fba', 'fbad2', 'fbajc', 'fbawc']);
export type LeagueId = z.infer<typeof LeagueId>;

const perLeague = <T extends z.ZodTypeAny>(s: T) => z.object({ fba: s, fbad2: s, fbajc: s, fbawc: s }).strict();

export const Position = z.enum(['PG', 'SG', 'SF', 'PF', 'C']);
export type Position = z.infer<typeof Position>;

export const ClassYear = z.enum(['Fr', 'So', 'Jr', 'Sr']);
export type ClassYear = z.infer<typeof ClassYear>;

export const RetiredInfo = z.object({
  season: int,
  league: z.enum(['fba', 'fbad2']),
  /** null = D2 Reserves. */
  teamId: z.string().min(1).nullable(),
  position: Position,
}).strict();
export type RetiredInfo = z.infer<typeof RetiredInfo>;

export const Player = z.object({
  id: z.string().regex(/^p\d{5}$/),
  name: z.string().min(1).nullable(),
  birthSeason: int.nullable(),
  retired: RetiredInfo.optional(),
}).strict();
export type Player = z.infer<typeof Player>;

export const PlayersFile = z.object({ nextId: int.positive(), players: z.record(z.string(), Player) }).strict();
export type PlayersFile = z.infer<typeof PlayersFile>;

/** `accent` is a second colour (the college teams take both from their logo); the theme uses it where a team has no hand-picked pair. */
export const Badge = z.object({ bg: z.string(), fg: z.string(), accent: z.string().optional() }).strict();
export type Badge = z.infer<typeof Badge>;

export const Team = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  abbr: z.string().min(1),
  group: z.string().nullable(),
  logoFolder: z.string().nullable(),
  /** A file inside a folder that many teams share (the college logos, `FBAJC_Final/Duke.png`); without it the folder's logo for the season is used. */
  logoFile: z.string().min(1).optional(),
  badge: Badge,
  /** ISO 3166 code (or gb-eng/gb-sct/gb-nir) for a flag; World Cup countries only. */
  flag: z.string().regex(/^[a-z]{2}(-[a-z]{3})?$/).optional(),
}).strict();
export type Team = z.infer<typeof Team>;

export const TeamsFile = z.object({ league: LeagueId, teams: z.array(Team) }).strict();
export type TeamsFile = z.infer<typeof TeamsFile>;

/** leagues/fbawc/hosts.json: the World Cup host city and country by season (imported, part 5a). */
export const WcHostsFile = z.object({
  hosts: z.array(z.object({ season: int.min(1), city: z.string().min(1), country: z.string().min(1) }).strict()),
}).strict().refine(f => new Set(f.hosts.map(h => h.season)).size === f.hosts.length, 'Each season appears once');
export type WcHostsFile = z.infer<typeof WcHostsFile>;

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

const playerId = z.string().regex(/^p\d{5}$/);

export const Champion = z.object({
  title: z.string(),
  champion: z.string(),
  runnerUp: z.string().nullable(),
  score: z.string().nullable(),
  /** Set on seasons finished in the app (2b-2c on); imported seasons may lack them. */
  teamId: z.string().min(1).optional(),
  runnerUpId: z.string().min(1).optional(),
  /** The D2 league of this title; null for the FBA. */
  group: z.string().min(1).nullable().optional(),
  finalsMvp: playerId.nullable().optional(),
  /** A generated player's name when `finalsMvp` is null (World Cup). */
  mvpName: z.string().min(1).optional(),
}).strict();
export type Champion = z.infer<typeof Champion>;

/** One name a franchise played under, from the team history sheet. `to` is null for the current era. */
export const FranchiseEra = z.object({
  name: z.string().min(1),
  abbr: z.string().min(1),
  city: z.string().min(1),
  from: int.min(1),
  to: int.min(1).nullable(),
}).strict().refine(e => e.to === null || e.to >= e.from, { message: 'to must be null or at least from' });
export type FranchiseEra = z.infer<typeof FranchiseEra>;
export const Franchise = z.object({ teamId: z.string().min(1), eras: z.array(FranchiseEra).min(1) }).strict();
export type Franchise = z.infer<typeof Franchise>;
/** leagues/fba/franchises.json: each franchise's name eras, newest first. */
export const FranchisesFile = z.object({ franchises: z.array(Franchise) }).strict();
export type FranchisesFile = z.infer<typeof FranchisesFile>;

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
  /** Their rating on the FBA free-agent list when free agency closed; orders the D2 reset's "New" group. */
  fbaRating: int.min(1).max(99).optional(),
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

export const TransactionType = z.enum([
  'signed', 'resigned', 'released', 'cut', 'trade', 'edit', 'fa-closed', 'drafted', 'd2-pool', 'd2-ratings', 'awards', 'season', 'class', 'commit', 'portal', 'lottery', 'retired', 'hall-of-fame', 'walk-on', 'college-ratings', 'adjust-age', 'declare', 'fba-ratings',
]);
export type TransactionType = z.infer<typeof TransactionType>;

export const TransactionEntry = z.object({
  seq: int.positive(),
  batchId: z.string().min(1),
  type: TransactionType,
  teams: z.array(z.string()),
  lines: z.array(z.string().min(1)),
}).strict();
export type TransactionEntry = z.infer<typeof TransactionEntry>;

/** Locked by "Go to next season" once its season is over. */
export const TransactionsFile = z.object({ league: LeagueId, season: int, locked: z.boolean().optional(), entries: z.array(TransactionEntry) }).strict();
export type TransactionsFile = z.infer<typeof TransactionsFile>;

const d2Rating = int.min(1).max(99);

/** The top this many at each position make the D2; players ranked past it in the D2 reset go unrated to the Reserve pool. */
export const D2_POSITION_SPOTS = 64;

const consensus = z.number().min(70).max(100);

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

export const RankingKind = z.enum(['d2-reset', 'college-class', 'college-reset', 'fba-reset']);
export type RankingKind = z.infer<typeof RankingKind>;

export const RankingRow = z.object({
  playerId,
  position: Position,
  age: int.nullable(),
  /** Team id, or null (D2 Reserves). */
  team: z.string().min(1).nullable(),
  /** Last season's base rating in this league; null = new to this league. */
  prevRating: int.nullable(),
  /** True for a D2 Reserve who was already in the pool (not a rookie or FBA free agent): ranked with the existing players. */
  inLeague: z.boolean().optional(),
  /** A rating from another league, used only to order the "New" group. */
  otherRating: int.nullable(),
  /** One line of context, e.g. "412 pts". */
  stat: z.string().min(1).nullable(),
}).strict();
export type RankingRow = z.infer<typeof RankingRow>;

/** One click-to-rank reset. `order` is the new ranking, best first; rank k's suggestion is curve[k - 1]. */
export const RankingFile = z.object({
  league: LeagueId,
  season: int,
  kind: RankingKind,
  locked: z.boolean(),
  rows: z.array(RankingRow),
  order: idList,
  /** What the commissioner entered or accepted; a sent-back row keeps its rating. */
  ratings: z.record(playerId, d2Rating),
  curve: z.array(d2Rating),
  /** college-class only: each player's consensus, and the suggestion ladder (high to low). */
  consensus: z.record(playerId, consensus).optional(),
  consensusCurve: z.array(consensus).optional(),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const ids = new Set(doc.rows.map(r => r.playerId));
  if (ids.size !== doc.rows.length) issue('A player is listed twice in the rows');
  if (new Set(doc.order).size !== doc.order.length) issue('A player is ranked twice');
  for (const id of doc.order) if (!ids.has(id)) issue(`${id} is ranked but isn't in the rows`);
  for (const id of Object.keys(doc.ratings)) if (!ids.has(id)) issue(`${id} has a rating but isn't in the rows`);
  if (doc.curve.some((v, k) => k > 0 && v > doc.curve[k - 1])) issue('The curve must run from high to low');
  if (doc.locked) {
    if (doc.order.length !== doc.rows.length) issue('A finished ranking must rank every player');
    // A D2 reset leaves the players ranked past their position's spots unrated: they go to the Reserve pool.
    const byId = new Map(doc.rows.map(r => [r.playerId, r.position]));
    const seen = new Map<string, number>();
    const unrated = doc.order.filter(id => {
      const pos = byId.get(id) ?? '';
      const n = (seen.get(pos) ?? 0) + 1;
      seen.set(pos, n);
      return doc.ratings[id] === undefined && !(doc.kind === 'd2-reset' && n > D2_POSITION_SPOTS);
    });
    if (unrated.length) issue('A finished ranking must rate every player');
  }
  if (doc.kind !== 'college-class' && (doc.consensus || doc.consensusCurve)) issue('Only a class ranking has consensus');
  for (const id of Object.keys(doc.consensus ?? {})) if (!ids.has(id)) issue(`${id} has a consensus but isn't in the rows`);
  if ((doc.consensusCurve ?? []).some((v, k, a) => k > 0 && v > a[k - 1])) issue('The consensus curve must run from high to low');
  if (doc.locked && doc.kind === 'college-class' && doc.order.some(id => doc.consensus?.[id] === undefined)) {
    issue('A finished class ranking must give every player a consensus');
  }
});
export type RankingFile = z.infer<typeof RankingFile>;

export const Prospect = z.object({
  playerId,
  position: Position,
  /** 'Fr' for recruits; a transfer's current class year. */
  classYear: ClassYear,
  /** Recruits: null until Rank Class (7c). Transfers: their college rating. */
  rating: d2Rating.nullable(),
  stars: int.min(3).max(5).nullable(),
  /** Recruiting score shown on the board (stars follow it: 90+ 5★, 80+ 4★, 70+ 3★). Null until Rank Class. */
  consensus: consensus.nullable().optional(),
  /** Projection counts per school (team id); each count is at least 1. */
  projections: z.record(z.string().min(1), int.positive()),
  committedTo: z.string().min(1).nullable(),
}).strict();
export type Prospect = z.infer<typeof Prospect>;

export const PortalPlayer = Prospect.extend({ fromTeam: z.string().min(1) }).strict();
export type PortalPlayer = z.infer<typeof PortalPlayer>;

/** A Create Class row; the name may be blank while it is being typed. */
export const ClassDraftRow = z.object({ name: z.string(), position: Position }).strict();
export type ClassDraftRow = z.infer<typeof ClassDraftRow>;

/** The recruiting board of the class created in calendar season `season`; it plays its Freshman year in that season's FBAJC. */
export const RecruitingFile = z.object({
  league: z.literal('fbajc'),
  season: int,
  classOf: int,
  locked: z.boolean(),
  /** Create Class rows before "Create class". */
  classDraft: z.array(ClassDraftRow),
  created: z.boolean(),
  recruits: z.array(Prospect),
  portal: z.array(PortalPlayer),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (doc.classOf !== doc.season + 1) issue('classOf must be the season + 1');
  const seen = new Set<string>();
  for (const p of [...doc.recruits, ...doc.portal]) {
    if (seen.has(p.playerId)) issue(`${p.playerId} is on the board twice`);
    seen.add(p.playerId);
  }
  if (doc.created && doc.classDraft.length) issue('The class draft must be empty once the class is created');
  if (!doc.created && doc.recruits.length) issue('There are no recruits until the class is created');
});
export type RecruitingFile = z.infer<typeof RecruitingFile>;

const seasonLeague = z.enum(['fba', 'fbad2']);

export const PauseKind = z.enum(['ratings', 'deadline', 'allstar']);
export type PauseKind = z.infer<typeof PauseKind>;

export const SchedulePause = z.object({ afterGame: int.nonnegative(), kind: PauseKind, done: z.boolean() }).strict();
export type SchedulePause = z.infer<typeof SchedulePause>;

export const ScheduleGame = z.object({ gameNo: int.positive(), home: z.string().min(1), away: z.string().min(1) }).strict();
export type ScheduleGame = z.infer<typeof ScheduleGame>;

export const QualifyingFile = z.object({
  league: z.literal('fbawc'),
  season: int,
  /** Host country's fbawc teamId (the S{season+1} host). */
  host: z.string().min(1),
  auto: z.array(z.string().min(1)).length(15),
  /** The 70 teams that play qualifying. */
  field: z.array(z.string().min(1)).length(70),
  schedule: z.array(ScheduleGame),
  /** Random tiebreak key per country (all 85: rating ties for the top 15, then qualifying ties), drawn once. */
  keys: z.record(z.string(), z.number()),
  games: z.array(GameResult),
  /** The 49 advancing teams; empty until finished. */
  advanced: z.array(z.string().min(1)),
}).strict().superRefine((d, ctx) => {
  if (d.advanced.length !== 0 && d.advanced.length !== 49) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'advanced must be empty or 49 teams' });
  if (new Set([...d.auto, ...d.field]).size !== 85) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'auto and field must be 85 distinct teams' });
  if ([...d.auto, ...d.field].some(id => typeof d.keys[id] !== 'number')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'keys must cover all 85 teams' });
});
export type QualifyingFile = z.infer<typeof QualifyingFile>;

export const KnockoutRound = z.enum(['R32', 'R16', 'QF', 'SF', 'F']);
export type KnockoutRound = z.infer<typeof KnockoutRound>;
export const KnockoutGame = z.object({
  id: z.string().min(1),           // e.g. 'R32-1' .. 'R32-16', 'R16-1' .. 'F-1'
  round: KnockoutRound,
  home: z.string().min(1).nullable(),
  away: z.string().min(1).nullable(),
  game: GameResult.nullable(),
}).strict();
export type KnockoutGame = z.infer<typeof KnockoutGame>;

export const WorldCupFile = z.object({
  league: z.literal('fbawc'),
  season: int,
  host: z.string().min(1),
  field: z.array(z.string().min(1)).length(64),
  /** Four pots of 16, best rating first within each. */
  pots: z.array(z.array(z.string().min(1)).length(16)).length(4),
  /** Groups 'A'..'P', four teams each. */
  groups: z.record(z.string().regex(/^[A-P]$/), z.array(z.string().min(1)).length(4)),
  keys: z.record(z.string(), z.number()),
  schedule: z.array(ScheduleGame),
  groupGames: z.array(GameResult),
  /** Empty until the group stage is finished. */
  knockout: z.array(KnockoutGame),
  champion: z.string().min(1).nullable(),
  runnerUp: z.string().min(1).nullable(),
}).strict().superRefine((d, ctx) => {
  if ((d.champion === null) !== (d.runnerUp === null)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'champion and runnerUp must be both null or both set' });
});
export type WorldCupFile = z.infer<typeof WorldCupFile>;

export const ScheduleFile = z.object({
  league: seasonLeague,
  season: int,
  locked: z.boolean(),
  games: z.array(ScheduleGame),
  /** In the order they must be finished; several pauses may share an afterGame. */
  pauses: z.array(SchedulePause),
}).strict();
export type ScheduleFile = z.infer<typeof ScheduleFile>;

export const JcScheduleFile = z.object({
  league: z.literal('fbajc'),
  season: int,
  locked: z.boolean(),
  tournaments: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    teams: z.array(z.string().min(1)).length(8),
  }).strict().superRefine((t, ctx) => {
    if (new Set(t.teams).size !== t.teams.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'tournament teams must be distinct' });
  })),
  days: z.array(z.object({
    day: int.min(1).max(29),
    kind: z.enum(['tournament', 'challenge', 'conference']),
    games: z.array(z.object({
      gameNo: int.positive(),
      home: z.string().min(1),
      away: z.string().min(1),
      tournament: z.string().min(1).optional(),
    }).strict()),
  }).strict()),
  /** Stored tiebreak draw per team. */
  drawKeys: z.record(z.string(), z.number()),
}).strict().superRefine((d, ctx) => {
  if (new Set(d.days.map(x => x.day)).size !== d.days.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'day numbers must be unique' });
});
export type JcScheduleFile = z.infer<typeof JcScheduleFile>;

export const JcRankingsFile = z.object({
  league: z.literal('fbajc'),
  season: int,
  locked: z.boolean(),
  /** afterDay 0 = preseason; order lists every team, best first. */
  snapshots: z.array(z.object({ afterDay: int.min(0).max(33), order: z.array(z.string().min(1)) }).strict()),
}).strict();
export type JcRankingsFile = z.infer<typeof JcRankingsFile>;

/** One game of a postseason bracket. `home` is the first-listed team (no home advantage). */
export const BracketGame = z.object({
  id: z.string().min(1),
  round: int.min(1).max(6),
  /** 0-3 for the March Madness and NIT regions; 0 elsewhere. */
  region: int.min(0).max(3),
  home: z.string().min(1).nullable(),
  away: z.string().min(1).nullable(),
  homeSeed: int.min(1).max(16).nullable(),
  awaySeed: int.min(1).max(16).nullable(),
  /** Where the winner goes; null for the final. */
  next: z.object({ id: z.string().min(1), side: z.enum(['home', 'away']) }).strict().nullable(),
  result: GameResult.nullable(),
}).strict();
export type BracketGame = z.infer<typeof BracketGame>;

export const Bracket = z.object({
  id: z.string().min(1),
  kind: z.enum(['conf', 'mm', 'nit']),
  name: z.string().min(1),
  games: z.array(BracketGame),
  champion: z.string().min(1).nullable(),
}).strict().superRefine((b, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const byId = new Map(b.games.map(g => [g.id, g]));
  if (byId.size !== b.games.length) issue(`${b.id}: game ids must be unique`);
  const fed = new Set<string>();
  const teams = new Set<string>();
  for (const g of b.games) {
    if (g.next) {
      if (!byId.has(g.next.id)) issue(`${b.id}/${g.id}: next game ${g.next.id} doesn't exist`);
      const slot = `${g.next.id}|${g.next.side}`;
      if (fed.has(slot)) issue(`${b.id}/${g.id}: two games feed ${slot}`);
      fed.add(slot);
    }
    for (const t of [g.home, g.away]) if (t) teams.add(t);
    if (g.result) {
      if (g.home === null || g.away === null) issue(`${b.id}/${g.id}: a game with a result needs both teams`);
      else if (g.result.home !== g.home || g.result.away !== g.away) issue(`${b.id}/${g.id}: the result's teams don't match the game`);
      if (g.result.homePts === g.result.awayPts) issue(`${b.id}/${g.id}: a game can't end tied`);
    }
  }
  if (b.champion !== null && !teams.has(b.champion)) issue(`${b.id}: the champion isn't in the bracket`);
  const finals = b.games.filter(g => g.next === null);
  if (finals.length !== 1) issue(`${b.id}: a bracket has exactly one final`);
  else if ((b.champion !== null) !== (finals[0].result !== null)) issue(`${b.id}: the champion is set exactly when the final is played`);
});
export type Bracket = z.infer<typeof Bracket>;

/** Postseason games are numbered from 3133 (after the 3132 regular-season games). */
export const JC_FIRST_POST_GAME = 3133;

export const JcPostseasonFile = z.object({
  league: z.literal('fbajc'),
  season: int,
  locked: z.boolean(),
  nextGameNo: int.min(JC_FIRST_POST_GAME),
  /** One bracket per conference, id = the conference code. */
  conf: z.array(Bracket),
  /** Each conference's regular-season champions (every team tied for the best conference record). */
  rsChampions: z.record(z.string(), z.array(z.string().min(1)).min(1)),
  field: z.object({
    mm: z.object({
      /** The 64 teams in the order the Java picked them. */
      teams: z.array(z.string().min(1)),
      seeds: z.record(z.string(), int.min(1).max(16)),
      /** Four regions of 16 in the Java's slot order. */
      regions: z.array(z.array(z.string().min(1))),
    }).strict(),
    /** The 32 NIT teams, best seed first. */
    nit: z.object({ teams: z.array(z.string().min(1)) }).strict(),
    warnings: z.array(z.string()),
  }).strict().nullable(),
  nit: Bracket.nullable(),
  mm: Bracket.nullable(),
}).strict().superRefine((d, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (d.conf.length !== 18) issue('There are 18 conference tournaments');
  if (new Set(d.conf.map(b => b.id)).size !== d.conf.length) issue('A conference tournament is listed twice');
  for (const b of d.conf) if (b.kind !== 'conf') issue(`${b.id}: a conference tournament has kind conf`);
  if (d.mm && d.mm.kind !== 'mm') issue('The March Madness bracket has kind mm');
  if (d.nit && d.nit.kind !== 'nit') issue('The NIT bracket has kind nit');
  if ((d.field === null) !== (d.mm === null) || (d.field === null) !== (d.nit === null)) issue('The field, the March Madness bracket and the NIT bracket exist together');
  if (d.field) {
    const mm = d.field.mm.teams;
    const nit = d.field.nit.teams;
    if (mm.length !== 64 || new Set(mm).size !== 64) issue('March Madness has 64 distinct teams');
    if (nit.length !== 32 || new Set(nit).size !== 32) issue('The NIT has 32 distinct teams');
    if (nit.some(t => mm.includes(t))) issue('A team is in both March Madness and the NIT');
    const regions = d.field.mm.regions;
    if (regions.length !== 4 || regions.some(r => r.length !== 16)) issue('March Madness has four regions of 16');
    else if (new Set(regions.flat()).size !== 64 || regions.flat().some(t => !mm.includes(t))) issue('The regions must hold exactly the 64 teams');
  }
});
export type JcPostseasonFile = z.infer<typeof JcPostseasonFile>;

export const JcNationalAward = z.enum(['POY', 'FOY', 'GOY', 'FWD', 'COY', 'DPOY']);
export type JcNationalAward = z.infer<typeof JcNationalAward>;
export const JC_NATIONAL_AWARDS: JcNationalAward[] = ['POY', 'FOY', 'GOY', 'FWD', 'COY', 'DPOY'];
/** Slot order of every FBAJC All-American team (rule change S71). */
export const JC_ALL_AMERICAN_SLOTS = ['G', 'F', 'C', 'ANY', 'ANY'] as const;

export const JcAllAmericanTeam = z.object({
  team: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  slots: z.array(z.object({ slot: z.enum(['G', 'F', 'C', 'ANY']), playerId: playerId.nullable() }).strict()),
}).strict();
export type JcAllAmericanTeam = z.infer<typeof JcAllAmericanTeam>;

export const JcAwardsFile = z.object({
  league: z.literal('fbajc'),
  season: int,
  locked: z.boolean(),
  national: z.array(z.object({ award: JcNationalAward, playerId: playerId.nullable() }).strict()),
  conference: z.array(z.object({ conf: z.string().min(1), playerId: playerId.nullable() }).strict()),
  allAmerican: z.array(JcAllAmericanTeam).nullable(),
  mvp: z.object({ mm: playerId.nullable(), nit: playerId.nullable() }).strict(),
}).strict().superRefine((d, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (d.national.length !== 6 || new Set(d.national.map(a => a.award)).size !== 6) issue('There are six national awards, each once');
  if (d.conference.length !== 18 || new Set(d.conference.map(a => a.conf)).size !== 18) issue('There are 18 conference awards, one per conference');
  if (d.allAmerican) {
    if (d.allAmerican.length !== 3 || d.allAmerican.some((t, k) => t.team !== k + 1)) issue('There are three All-American teams, in order');
    const seen = new Set<string>();
    for (const t of d.allAmerican) {
      if (t.slots.length !== 5 || t.slots.some((s, k) => s.slot !== JC_ALL_AMERICAN_SLOTS[k])) issue(`All-American team ${t.team} must follow G, F, C, ANY, ANY`);
      for (const sl of t.slots) {
        if (!sl.playerId) continue;
        if (seen.has(sl.playerId)) issue(`${sl.playerId} is on the All-American teams twice`);
        seen.add(sl.playerId);
      }
    }
  }
});
export type JcAwardsFile = z.infer<typeof JcAwardsFile>;

export const PastSide = z.object({ name: z.string().min(1), record: z.string().regex(/^\d+-\d+(-\d+)?$/).nullable(), /** Up to 64: the college brackets print seeds beyond 16 (a 32-team NIT, older March Madness pages). */
  seed: int.min(1).max(64).nullable() }).strict();
export type PastSide = z.infer<typeof PastSide>;
export const PastSeries = z.object({
  id: z.string().regex(/^R\d-\d+$/),
  round: int.min(1).max(6),
  home: PastSide.nullable(),
  away: PastSide.nullable(),
  homeWins: int.min(0).max(4),
  awayWins: int.min(0).max(4),
  winner: z.enum(['home', 'away']),
  /** A single game's points, winner first (for example 97–75, or 48-46 OT, 91-88 2OT); the wins are then 1-0. */
  score: z.string().regex(/^\d+[–-]\d+( \d?OT)?$/).optional(),
  /** A series whose page prints only the winner (no scores): 0-0 in wins, no score, a real loser. */
  unscored: z.literal(true).optional(),
}).strict();
export type PastSeries = z.infer<typeof PastSeries>;
/** A transcribed historical bracket: a full binary tree of series, R1-1... up to the final. */
export const PastBracket = z.object({ rounds: int.min(1).max(6), series: z.array(PastSeries) }).strict().superRefine((b, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const byId = new Map(b.series.map(s => [s.id, s]));
  for (let r = 1; r <= b.rounds; r++) {
    const n = 2 ** (b.rounds - r);
    for (let k = 1; k <= n; k++) if (!byId.has(`R${r}-${k}`)) issue(`Missing R${r}-${k}`);
  }
  if (byId.size !== b.series.length) issue('Series ids must be unique');
  for (const s of b.series) {
    if (Number(s.id[1]) !== s.round) issue(`${s.id}: round doesn't match its id`);
    if (s.round > b.rounds) issue(`${s.id}: round ${s.round} is beyond the ${b.rounds}-round bracket`);
    else if (Number(s.id.split('-')[1]) > 2 ** (b.rounds - s.round)) issue(`${s.id}: series number is out of range`);
    const win = s[s.winner];
    const lose = s[s.winner === 'home' ? 'away' : 'home'];
    if (!s.home && !s.away) {
      // Early sparse brackets: two BYE slots meet and nothing is played; the empty slot carries on to the next round.
      if (s.winner !== 'home' || s.homeWins || s.awayWins || s.score || s.unscored) issue(`${s.id}: an empty series (two BYEs) has no winner, wins or score`);
      if (s.round < b.rounds) {
        const next = byId.get(`R${s.round + 1}-${Math.ceil(Number(s.id.split('-')[1]) / 2)}`);
        if (next?.[Number(s.id.split('-')[1]) % 2 === 1 ? 'home' : 'away']) issue(`${s.id}: an empty series can't feed a team into ${next!.id}`);
      }
      continue;
    }
    if (!win) { issue(`${s.id}: the winner can't be a BYE`); continue; }
    if (!lose && (s.homeWins || s.awayWins)) issue(`${s.id}: a BYE series has no wins`);
    if (s.unscored) {
      if (!lose) issue(`${s.id}: an unscored series needs a loser`);
      if (s.homeWins || s.awayWins) issue(`${s.id}: an unscored series has no wins`);
      if (s.score) issue(`${s.id}: an unscored series has no score`);
    } else if (lose && s[`${s.winner}Wins`] <= s[s.winner === 'home' ? 'awayWins' : 'homeWins']) issue(`${s.id}: the winner needs more wins`);
    if (s.score) {
      const [a, c] = s.score.replace(/ \d?OT$/, '').split(/[–-]/).map(Number);
      if (s[`${s.winner}Wins`] !== 1 || s[s.winner === 'home' ? 'awayWins' : 'homeWins'] !== 0) issue(`${s.id}: a scored game is 1-0 in wins`);
      if (!(a > c)) issue(`${s.id}: the winner's points must be larger`);
    }
    if (s.round < b.rounds) {
      const k = Number(s.id.split('-')[1]);
      const next = byId.get(`R${s.round + 1}-${Math.ceil(k / 2)}`);
      const side = next?.[k % 2 === 1 ? 'home' : 'away'];
      if (next && side?.name !== win.name) issue(`${s.id}: ${win.name} should advance to ${next.id}`);
    }
  }
});
export type PastBracket = z.infer<typeof PastBracket>;

/** A player slot of an imported season carries the sheet's name and school as text; `playerId`/`teamId` are set when exactly one match exists. */
const importedWho = { name: z.string().min(1).optional(), school: z.string().min(1).optional() };
export const JcSummary = z.object({
  confChampions: z.array(z.object({
    conf: z.string().min(1),
    tournament: z.string().min(1).nullable(),
    regularSeason: z.array(z.string().min(1)),
    /** Imported history: each regular-season champion's conference record ("12-3"), null when the sheet gives none. */
    regularSeasonRecords: z.array(z.string().regex(/^\d+-\d+$/).nullable()).optional(),
  }).strict().refine(c => !c.regularSeasonRecords || c.regularSeasonRecords.length === c.regularSeason.length, 'One record (or null) per regular-season champion')),
  national: z.array(z.object({ award: JcNationalAward, playerId: playerId.nullable(), teamId: z.string().min(1).nullable(), ...importedWho }).strict()),
  conference: z.array(z.object({ conf: z.string().min(1), playerId: playerId.nullable(), teamId: z.string().min(1).nullable(), ...importedWho }).strict()),
  allAmerican: z.array(z.object({
    team: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    slots: z.array(z.object({ slot: z.enum(['G', 'F', 'C', 'ANY']), playerId: playerId.nullable(), teamId: z.string().min(1).nullable(), ...importedWho }).strict()),
  }).strict()).nullable(),
  mvp: z.object({ mm: playerId.nullable(), nit: playerId.nullable() }).strict(),
  nit: z.object({ champion: z.string().min(1), runnerUp: z.string().min(1) }).strict().nullable(),
  /** Imported history: the MVPs' names when no player matched. */
  mvpNames: z.object({ mm: z.string().min(1).nullable(), nit: z.string().min(1).nullable() }).strict().optional(),
  /** Imported history (S64 on): each preseason tournament's champion. */
  preseason: z.array(z.object({ event: z.string().min(1), champion: z.string().min(1), teamId: z.string().min(1).nullable().optional() }).strict()).optional(),
  /** Imported history, S53–S70: All-American teams in the sheet's own slot labels (OUT/MID/IN, G/F/C/ANY, PG/SG/SF/PF/C). From S71 the `allAmerican` shape is used. */
  allAmericanLegacy: z.object({
    teams: z.array(z.object({
      team: int.min(1),
      slots: z.array(z.object({ slot: z.string().min(1), name: z.string().min(1), school: z.string().min(1).nullable(), playerId: playerId.nullable(), teamId: z.string().min(1).nullable().optional() }).strict()).min(1),
    }).strict()).min(1),
  }).strict().optional(),
  /** Imported history: the transcribed NIT bracket. */
  nitBracket: PastBracket.nullable().optional(),
}).strict().superRefine((d, ctx) => {
  if (d.allAmerican && d.allAmericanLegacy) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A season has allAmerican or allAmericanLegacy, not both' });
});
export type JcSummary = z.infer<typeof JcSummary>;

/** The college league's own first ten seasons (S1-S10), before March Madness appearances were listed. */
export const JC_EARLY_ERA_LAST_SEASON = 10;
const seasonList = z.array(int.min(1)).superRefine((l, ctx) => {
  if (l.some((v, i) => i > 0 && v <= l[i - 1])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Seasons must be sorted and unique' });
});
const confTitles = z.array(z.object({ season: int.min(1), /** The school's conference that season when the sheet names another one; null = its current conference. */ conf: z.string().min(1).nullable() }).strict());

/** Each FBAJC school's March Madness rounds and conference titles through S78 (imported from the school history sheet). */
export const JcSchoolHistoryFile = z.object({
  league: z.literal('fbajc'),
  throughSeason: int.min(1),
  schools: z.array(z.object({
    teamId: z.string().min(1),
    mm: z.object({ app: seasonList, sweet16: seasonList, elite8: seasonList, final4: seasonList, titleGame: seasonList, champion: seasonList }).strict(),
    rsChampion: confTitles,
    confTournament: confTitles,
    /** Total March Madness wins all-time; null when the sheet has none. */
    mmWins: int.min(0).nullable(),
  }).strict().superRefine((sc, ctx) => {
    const order = ['app', 'sweet16', 'elite8', 'final4', 'titleGame', 'champion'] as const;
    for (let i = 1; i < order.length; i++) {
      const outer = new Set(sc.mm[order[i - 1]]);
      // The college league's first ten seasons (the sheet marks them with a star) list rounds without a matching "MM App." entry.
      for (const season of sc.mm[order[i]]) if (season > JC_EARLY_ERA_LAST_SEASON && !outer.has(season)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${sc.teamId}: S${season} is in ${order[i]} but not ${order[i - 1]}` });
    }
  })),
}).strict().refine(f => new Set(f.schools.map(sc => sc.teamId)).size === f.schools.length, 'A school is listed twice');
export type JcSchoolHistoryFile = z.infer<typeof JcSchoolHistoryFile>;

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
  ysg: z.object({ semis: z.array(TeamGame), final: TeamGame, champion: int.min(0).max(3), mvp: playerId.optional(), mvpRollOff: RollOff.nullable().optional() }).strict().nullable(),
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

export const PlayoffSeed = z.object({ group: z.string().min(1), teams: z.array(teamRef).length(8), notes: z.array(z.string()) }).strict();
export type PlayoffSeed = z.infer<typeof PlayoffSeed>;

export const PlayoffsFile = z.object({
  league: seasonLeague,
  season: int,
  locked: z.boolean(),
  seeds: z.array(PlayoffSeed),
  series: z.array(PlayoffSeries),
  /** The Java rotation: unfinished series with both teams known, front first. */
  queue: z.array(z.string().min(1)),
  games: z.array(PlayoffGame),
  outcome: z.object({
    champions: z.array(z.object({ group: z.string().min(1).nullable(), teamId: teamRef, runnerUp: teamRef, score: z.string().min(1), finalsMvp: playerId.nullable().optional() }).strict()),
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

export const AwardId = z.enum(['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP', 'MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL', 'MVP-D2', 'MVP-AM', 'MVP-EW', 'MVP-EE', 'MVP-ES']);
export type AwardId = z.infer<typeof AwardId>;

const FBA_AWARD_IDS: AwardId[] = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP'];
const ALL_FBA_ORDER = ['G', 'F', 'C', 'ANY', 'ANY'] as const;

export const AllFbaSlot = z.object({
  slot: z.enum(['G', 'F', 'C', 'ANY']),
  playerId: z.string().min(1).nullable(),
  teamId: z.string().min(1).nullable(),
}).strict();
export type AllFbaSlot = z.infer<typeof AllFbaSlot>;

export const AwardEntry = z.object({ award: AwardId, playerId: z.string().min(1), teamId: z.string().min(1) }).strict();
export type AwardEntry = z.infer<typeof AwardEntry>;

export const AllFbaTeams = z.object({ team1: z.array(AllFbaSlot).length(5), team2: z.array(AllFbaSlot).length(5) }).strict();

export const AwardsFile = z.object({
  league: seasonLeague,
  season: int,
  locked: z.boolean(),
  awards: z.array(AwardEntry),
  /** FBA only. */
  allFba: AllFbaTeams.nullable(),
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

/** Regular-season or playoff sums for one player; the defense fields add up the box lines that carry them (games from 2b-2b on). */
export const SeasonTotals = z.object({ g: pts, pts, def: pts, stops: pts, allowed: pts, exp: pts }).strict();
export type SeasonTotals = z.infer<typeof SeasonTotals>;

/** One team stint (teamId and stint set), or a traded player's season total (both null). */
export const SummaryPlayerLine = z.object({
  playerId,
  teamId: z.string().min(1).nullable(),
  stint: int.positive().nullable(),
  position: Position,
  ratingStart: int.nullable(),
  ratingEnd: int.nullable(),
  rs: SeasonTotals,
  /** null when the player had no playoff games on this line. */
  po: SeasonTotals.nullable(),
}).strict();
export type SummaryPlayerLine = z.infer<typeof SummaryPlayerLine>;

/** The All-FBA slot orders found in the imported history (S1-S78). */
export const PAST_ALL_FBA_ORDERS = [
  ['G', 'F', 'C', 'ANY', 'ANY'], ['G', 'G', 'F', 'F', 'C'], ['OUT', 'MID', 'M2', 'IN'], ['OUT', 'MID', 'IN', 'ANY'],
] as const;
export const PastAllFbaSlot = z.object({
  slot: z.enum(['G', 'F', 'C', 'ANY', 'OUT', 'MID', 'M2', 'IN']),
  playerId: z.string().min(1).nullable(),
  teamId: z.string().min(1).nullable(),
}).strict();
export type PastAllFbaSlot = z.infer<typeof PastAllFbaSlot>;
export const PastAllFbaTeams = z.object({ team1: z.array(PastAllFbaSlot), team2: z.array(PastAllFbaSlot) }).strict()
  .refine(t => {
    const key = (xs: { slot: string }[]) => xs.map(s => s.slot).join(',');
    return key(t.team1) === key(t.team2) && PAST_ALL_FBA_ORDERS.some(o => o.join(',') === key(t.team1));
  }, 'Both All-FBA teams must follow the same known slot order');
export type PastAllFbaTeams = z.infer<typeof PastAllFbaTeams>;


export const PlayerBio = z.object({ playerId: z.string().regex(/^p\d{5}$/), born: z.string(), entries: z.array(z.string().min(1)) }).strict();
export type PlayerBio = z.infer<typeof PlayerBio>;
export const PlayerBiosFile = z.object({ league: z.literal('fba'), bios: z.array(PlayerBio) }).strict()
  .refine(f => new Set(f.bios.map(b => b.playerId)).size === f.bios.length, 'Each player has one bio');
export type PlayerBiosFile = z.infer<typeof PlayerBiosFile>;

export const AWARD_KEYS = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP', 'ALL_FBA_1', 'ALL_FBA_2', 'ALL_STAR', 'YOUNG_STAR',
  'ASG_MVP', 'YSG_MVP', 'FINALS_MVP', 'CHAMPION', 'CSHIP_APP', 'CONF_CHAMPION', 'FIVE_POINT', 'DUNK'] as const;
export type AwardKey = typeof AWARD_KEYS[number];

export const AwardCountsFile = z.object({
  league: z.literal('fba'),
  throughSeason: int.min(1),
  counts: z.array(z.object({ playerId: z.string().regex(/^p\d{5}$/), key: z.enum(AWARD_KEYS), count: int.min(1) }).strict()),
}).strict().refine(f => new Set(f.counts.map(c => `${c.playerId}:${c.key}`)).size === f.counts.length, 'Each player and award appear once');
export type AwardCountsFile = z.infer<typeof AwardCountsFile>;

export const SummaryStanding = z.object({
  teamId: teamRef,
  name: z.string().min(1),
  /** The conference (FBA) or league (D2) that season. */
  group: z.string().min(1),
  /** Place within the group. */
  rank: int.positive(),
  w: pts,
  l: pts,
  confW: pts.nullable(),
  confL: pts.nullable(),
  diff: int.nullable(),
  marker: z.enum(['*', 'x', 'n']).nullable(),
  seed: int.min(1).max(8).nullable(),
  /** The last round the team played; null = missed the playoffs. */
  playoff: z.object({ round: int.min(1).max(4), champion: z.boolean() }).strict().nullable(),
}).strict();
export type SummaryStanding = z.infer<typeof SummaryStanding>;

export const SummaryAllStar = z.object({
  allStars: idList,
  youngStars: idList,
  asgMvp: playerId.nullable(),
  fivePoint: playerId.nullable(),
  dunk: playerId.nullable(),
  asgWinner: z.string().min(1).nullable().optional(),
  asgLoser: z.string().min(1).nullable().optional(),
  ysgWinner: z.string().min(1).nullable().optional(),
  ysgMvp: playerId.nullable().optional(),
}).strict();
export type SummaryAllStar = z.infer<typeof SummaryAllStar>;

/** The record of a finished season. The fields after `champions` are optional, so the imported S78 summaries stay valid. */
export const SummaryFile = z.object({
  league: LeagueId,
  season: int,
  locked: z.boolean(),
  host: z.string().nullable(),
  champions: z.array(Champion),
  awards: z.array(AwardEntry).optional(),
  /** FBA only. */
  allFba: PastAllFbaTeams.nullable().optional(),
  /** FBA only. */
  allStar: SummaryAllStar.nullable().optional(),
  standings: z.array(SummaryStanding).optional(),
  /** The conference champions' names (imported history). */
  confChampions: z.object({ E: z.string().min(1).nullable(), W: z.string().min(1).nullable() }).strict().nullable().optional(),
  /** A transcribed bracket (imported history). */
  pastBracket: PastBracket.nullable().optional(),
  /** D2 only: one bracket per league tournament (imported history). */
  pastBrackets: z.array(z.object({ group: z.enum(['PL', 'WL', 'UL', 'IL']), bracket: PastBracket }).strict()).optional(),
  bracket: z.object({ seeds: z.array(PlayoffSeed), series: z.array(PlayoffSeries) }).strict().nullable().optional(),
  /** D2 only. */
  promotion: z.array(PromotionLine).nullable().optional(),
  /** D2 only: the regular-season (or, before S68, division) champions by group; co-champions share a group (imported history). */
  rsChampions: z.array(z.object({ group: z.string().min(1), teams: z.array(z.string().min(1)).min(1) }).strict()).optional(),
  /** FBAJC only: conference champions, awards, All-American teams, MVPs and the NIT. */
  jc: JcSummary.optional(),
  players: z.array(SummaryPlayerLine).optional(),
  /** Imported pre-stats seasons: each player's points per game (imported history). */
  legacyPpg: z.array(z.object({ playerId, teamId: z.string().min(1).nullable(), ppg: z.number().min(0) }).strict()).optional(),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (doc.league !== 'fba' && (doc.allFba || doc.allStar)) issue('Only the FBA has All-FBA teams and an All-Star weekend');
  if (doc.league !== 'fbad2' && doc.promotion) issue('Only the D2 has promotion and relegation');
  if (doc.league !== 'fbad2' && doc.rsChampions) issue('Only the D2 has regular-season league champions');
  if (doc.league !== 'fbajc' && doc.jc) issue('Only the FBAJC has a college postseason record');
  if (doc.pastBrackets?.length) {
    if (doc.pastBracket) issue('A summary has pastBracket or pastBrackets, not both');
    if (doc.league !== 'fbad2') issue('Only the D2 has one bracket per league');
    const groups = doc.pastBrackets.map(p => p.group);
    if (new Set(groups).size !== groups.length) issue('A league tournament bracket is listed twice');
  }
  const keys = new Set<string>();
  const stints = new Map<string, number>();
  const totals = new Set<string>();
  for (const p of doc.players ?? []) {
    if ((p.teamId === null) !== (p.stint === null)) issue(`${p.playerId}: a line has both a team and a stint, or neither`);
    const key = `${p.playerId}#${p.stint ?? 'total'}`;
    if (keys.has(key)) issue(`${p.playerId} has two lines for ${p.stint === null ? 'the season total' : `stint ${p.stint}`}`);
    keys.add(key);
    if (p.stint === null) totals.add(p.playerId);
    else stints.set(p.playerId, (stints.get(p.playerId) ?? 0) + 1);
  }
  for (const id of totals) if ((stints.get(id) ?? 0) < 2) issue(`${id} has a season total but fewer than two team lines`);
  const teams = (doc.standings ?? []).map(r => r.teamId);
  if (new Set(teams).size !== teams.length) issue('A team is listed twice in the standings');
});
export type SummaryFile = z.infer<typeof SummaryFile>;

export const LotteryOdds = z.object({ teamId: z.string().min(1), slot: int.positive(), w: int, l: int, pct: z.number().min(0).max(100) }).strict();
export type LotteryOdds = z.infer<typeof LotteryOdds>;

export const LotteryPick = z.object({
  slot: int.positive(),
  originalTeam: z.string().min(1),
  owner: z.string().min(1),
  obligationId: z.string().min(1).nullable(),
  flag: z.string().min(1).nullable(),
}).strict();
export type LotteryPick = z.infer<typeof LotteryPick>;

/** leagues/fba/S{n}/lottery.json: the lottery held in season n for the S{n+1} draft. */
export const LotteryFile = z.object({
  league: z.literal('fba'),
  season: int,
  draftSeason: int,
  locked: z.boolean(),
  odds: z.array(LotteryOdds),
  /** The drawn lottery, pick 1 first. */
  lottery: z.array(z.string().min(1)),
  /** The full draft order, pick 1 first. */
  order: z.array(z.string().min(1)),
  picks: z.array(LotteryPick),
}).strict();
export type LotteryFile = z.infer<typeof LotteryFile>;

export const DraftProspect = z.object({
  playerId,
  position: Position,
  /** The college (fbajc team id) he left. */
  college: z.string().min(1),
  classYear: ClassYear,
  /** Seniors enter at Adjust Age and can't go back to school or to the portal. */
  senior: z.boolean(),
  collegeRating: int.nullable(),
  stars: int.nullable(),
  /** Set by the pro reset, or typed on the board for a late entrant. */
  fbaRating: int.min(1).max(99).nullable(),
}).strict();
export type DraftProspect = z.infer<typeof DraftProspect>;

export const DraftPick = z.object({ slot: int.positive(), owner: z.string().min(1), originalTeam: z.string().min(1), playerId: playerId.nullable() }).strict();
export type DraftPick = z.infer<typeof DraftPick>;

/** leagues/fba/S{n}/draft.json: the S{n} draft board (prospects) and, once started, its picks. */
export const DraftFile = z.object({
  league: z.literal('fba'),
  season: int,
  locked: z.boolean(),
  started: z.boolean(),
  prospects: z.array(DraftProspect),
  picks: z.array(DraftPick),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const ids = new Set(doc.prospects.map(p => p.playerId));
  if (ids.size !== doc.prospects.length) issue('A prospect is listed twice');
  const picked = new Set<string>();
  for (const p of doc.picks) {
    if (p.playerId === null) continue;
    if (!ids.has(p.playerId)) issue(`${p.playerId} is picked but isn't a prospect`);
    if (picked.has(p.playerId)) issue(`${p.playerId} is picked twice`);
    picked.add(p.playerId);
  }
  if (!doc.started && doc.picks.length) issue('An unstarted draft has no picks');
  if (doc.locked && !doc.started) issue('A finished draft must have started');
});
export type DraftFile = z.infer<typeof DraftFile>;

export const HofCard = z.object({
  name: z.string().min(1),
  playerId: z.string().regex(/^p\d{5}$/).nullable(),
  /** Text: the sheet has "S64", "FFL" and "S--". */
  retiredSeason: z.string().min(1),
  lines: z.array(z.string()),
}).strict();
export type HofCard = z.infer<typeof HofCard>;

export const HallOfFameFile = z.object({
  league: z.literal('fba'),
  /** Oldest first; `season` is text like "S8". */
  classes: z.array(z.object({ season: z.string().min(1), inductees: z.array(HofCard) }).strict()),
  nominees: z.array(HofCard).max(15),
  /** Removed nominees; they can't be nominated again. */
  removed: z.array(z.object({ name: z.string().min(1), playerId: z.string().regex(/^p\d{5}$/).nullable() }).strict()),
}).strict();
export type HallOfFameFile = z.infer<typeof HallOfFameFile>;

/** leagues/fba/draftHistory.json: the sheet's past drafts (imported, 3c). */
export const DraftHistoryPick = z.object({
  /** Order among the drafted rows; null = undrafted. */
  pick: int.positive().nullable(),
  teamId: z.string().min(1).nullable(),
  /** The sheet's team text, e.g. "Cypress G"; null when undrafted. */
  teamName: z.string().min(1).nullable(),
  viaTeamId: z.string().min(1).nullable(),
  name: z.string().min(1),
  playerId: playerId.nullable(),
  pos: z.string().min(1),
  /** Class ("Freshman", "2xSenior", "S39", "X") or, for expansion drafts, age. */
  detail: z.string().min(1).nullable(),
  college: z.string().min(1).nullable(),
}).strict();
export type DraftHistoryPick = z.infer<typeof DraftHistoryPick>;
export const DraftHistoryDraft = z.object({ season: int.min(1), kind: z.enum(['draft', 'expansion']), picks: z.array(DraftHistoryPick) }).strict()
  .refine(d => d.picks.filter(p => p.pick !== null).every((p, i) => p.pick === i + 1), 'Drafted picks must be numbered 1..n in order');
export type DraftHistoryDraft = z.infer<typeof DraftHistoryDraft>;
export const DraftHistoryFile = z.object({ drafts: z.array(DraftHistoryDraft) }).strict()
  .refine(f => new Set(f.drafts.map(d => `${d.season}:${d.kind}`)).size === f.drafts.length, 'One draft of each kind per season');
export type DraftHistoryFile = z.infer<typeof DraftHistoryFile>;

export const PastAsset = z.object({ text: z.string().min(1), pos: z.string().min(1).nullable(), name: z.string().min(1).nullable(), playerId: playerId.nullable() }).strict();
export type PastAsset = z.infer<typeof PastAsset>;
export const PastMove = z.object({ to: z.string().min(1), asset: PastAsset }).strict();
export type PastMove = z.infer<typeof PastMove>;
const PastTrade = z.object({
  kind: z.literal('trade'), teamIds: z.array(z.string().min(1)).min(2), when: z.string().min(1).nullable(), notes: z.array(z.string().min(1)), moves: z.array(PastMove),
}).strict();
const PastTeamMove = z.object({ kind: z.enum(['cut', 'released', 'signed', 'acquired']), teamId: z.string().min(1), when: z.string().min(1).nullable(), asset: PastAsset }).strict();
export const PastTransaction = z.union([PastTrade, PastTeamMove]);
export type PastTransaction = z.infer<typeof PastTransaction>;
/** leagues/fba/pastTransactions.json: the sheet's Transactions tab (imported, 3c). */
export const PastTransactionsFile = z.object({ seasons: z.array(z.object({ season: int.min(1), entries: z.array(PastTransaction) }).strict()) }).strict()
  .refine(f => f.seasons.every((s, i) => i === 0 || s.season > f.seasons[i - 1].season), 'Seasons ascend without repeats');
export type PastTransactionsFile = z.infer<typeof PastTransactionsFile>;

/** leagues/fba/events.json: Events-tab notes and curated rule changes (imported, 3c). */
export const EventsFile = z.object({
  before: z.array(z.object({ label: z.string().min(1), notes: z.array(z.string().min(1)).min(1) }).strict()),
  seasons: z.array(z.object({ season: int.min(1), notes: z.array(z.string().min(1)), rules: z.array(z.string().min(1)) }).strict()),
}).strict().refine(f => f.seasons.every((s, i) => i === 0 || s.season > f.seasons[i - 1].season), 'Seasons ascend without repeats');
export type EventsFile = z.infer<typeof EventsFile>;

/** D2 groups before the S68 league split, then the four leagues. */
export const D2_PAST_GROUPS = ['AM', 'EW', 'EE', 'ES', 'PL', 'WL', 'UL', 'IL'] as const;
export const D2Spell = z.object({ group: z.enum(D2_PAST_GROUPS), from: int.min(1), to: int.min(1).nullable() }).strict()
  .refine(s => s.to === null || s.to >= s.from, 'A spell ends on or after it starts');
export type D2Spell = z.infer<typeof D2Spell>;
export const D2TeamLeagueHistory = z.object({ teamId: z.string().min(1), founded: int.min(1).nullable(), spells: z.array(D2Spell).min(1) }).strict()
  .refine(t => t.spells.every((s, i) => s.to !== null || i === t.spells.length - 1), 'Only the last spell can be open (pres.)');
export type D2TeamLeagueHistory = z.infer<typeof D2TeamLeagueHistory>;
/** leagues/fbad2/leagueHistory.json: each D2 team's leagues by season (imported, part 4). */
export const D2LeagueHistoryFile = z.object({ teams: z.array(D2TeamLeagueHistory) }).strict()
  .refine(f => new Set(f.teams.map(t => t.teamId)).size === f.teams.length, 'Each team appears once');
export type D2LeagueHistoryFile = z.infer<typeof D2LeagueHistoryFile>;

export const D2DraftPick = z.object({
  pick: int.positive(),
  teamId: z.string().min(1).nullable(),
  teamName: z.string().min(1),
  name: z.string().min(1),
  playerId: playerId.nullable(),
  pos: z.string().min(1),
  age: int.positive().nullable(),
  /** From S77 on; the earlier tabs have no rating column. */
  rating: int.min(0).max(150).nullable(),
}).strict();
export type D2DraftPick = z.infer<typeof D2DraftPick>;
export const D2DraftDraft = z.object({ season: int.min(1), picks: z.array(D2DraftPick) }).strict()
  .refine(d => d.picks.every((p, i) => p.pick === i + 1), 'Picks must be numbered 1..n in order');
export type D2DraftDraft = z.infer<typeof D2DraftDraft>;
/** leagues/fbad2/draftHistory.json: the draft sheet's "S68 D2"…"S78 D2" tabs (imported, part 4). */
export const D2DraftHistoryFile = z.object({ drafts: z.array(D2DraftDraft) }).strict()
  .refine(f => new Set(f.drafts.map(d => d.season)).size === f.drafts.length, 'One draft per season');
export type D2DraftHistoryFile = z.infer<typeof D2DraftHistoryFile>;
