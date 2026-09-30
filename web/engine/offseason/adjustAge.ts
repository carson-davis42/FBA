import { slotFor } from '../college/recruiting';
import { setupCollegeRosters } from '../college/setup';
import { boardPath, collegeName, schoolName, type RecruitingState } from '../college/state';
import { appendTx, docPath, withTeam, type MoveContext } from '../roster/state';
import { calendarProblem, type WritesResult } from '../season/moves';
import { markStepDone } from '../shared/calendar';
import type {
  CalendarFile, ClassYear, DraftFile, DraftProspect, FreeAgentsFile, MetaFile, PlayersFile, PortalPlayer, Position,
  RecruitingFile, ReservesFile, RosterEntry, RostersFile, TeamsFile, TransactionsFile,
} from '../shared/types';

export const ADJUST_AGE_STEP = 'adjust-age';
export const draftPath = (season: number) => `leagues/fba/S${season}/draft.json`;

export interface AdjustAgeState {
  season: number; calendar: CalendarFile; meta: MetaFile; players: PlayersFile;
  fba: RostersFile; freeAgents: FreeAgentsFile | null; d2: RostersFile; reserves: ReservesFile | null;
  /** fbajc S{n−1}. */
  prevCollege: RostersFile | null;
  /** The S{n} board, boardPath(n − 1). */
  board: RecruitingFile | null;
  collegeTeams: TeamsFile; fbaTx: TransactionsFile; collegeTx: TransactionsFile;
  draftExists: boolean;
}

export interface AdjustAgePreview {
  aged: number; seniors: number; xSeniors: number; placed: number;
  displaced: { playerId: string; teamId: string; classYear: ClassYear; position: Position; rating: number | null }[];
}

type Aging = { playerId: string | null; age: number | null };

const birthOf = (e: Aging, players: PlayersFile): number | null =>
  (e.playerId ? players.players[e.playerId]?.birthSeason ?? null : null);

/** Sets age = n − birth season; unchanged when there's no player or no birth season. */
export function ageEntry<T extends Aging>(e: T, n: number, players: PlayersFile): T {
  const birth = birthOf(e, players);
  return birth === null ? e : { ...e, age: n - birth };
}

const ratingNote = (rating: number | null) => (rating !== null ? `, ${rating}` : '');

interface Built {
  preview: AdjustAgePreview;
  fba: RostersFile; freeAgents: FreeAgentsFile | null; d2: RostersFile; reserves: ReservesFile | null;
  rosters: RostersFile; board: RecruitingFile | null; draft: DraftFile;
  portalLines: { teamId: string; line: string }[];
}

function build(state: AdjustAgeState): { ok: true; built: Built } | { ok: false; problems: string[] } {
  const n = state.season;
  const step = calendarProblem(state.calendar, ADJUST_AGE_STEP, 'Ages are adjusted');
  if (step) return { ok: false, problems: [step] };
  const jc = state.meta.rosterSeason.fbajc;
  if (jc === n) return { ok: false, problems: [`The S${n} college rosters already exist`] };
  if (jc !== n - 1) return { ok: false, problems: [`The college rosters are on S${jc}, not S${n - 1}`] };
  if (!state.prevCollege) return { ok: false, problems: [`The S${n - 1} college rosters are missing`] };
  if (state.draftExists) return { ok: false, problems: [`The S${n} draft board already exists`] };

  // 1. Pro ages.
  const { players } = state;
  let aged = 0;
  const age = <T extends Aging>(e: T): T => {
    if (birthOf(e, players) !== null) aged++;
    return ageEntry(e, n, players);
  };
  const ageRosters = (r: RostersFile): RostersFile =>
    ({ ...r, teams: Object.fromEntries(Object.entries(r.teams).map(([teamId, entries]) => [teamId, entries.map(age)])) });
  const fba = ageRosters(state.fba);
  const freeAgents = state.freeAgents && { ...state.freeAgents, players: state.freeAgents.players.map(age) };
  const d2 = ageRosters(state.d2);
  const reserves = state.reserves && { ...state.reserves, players: state.reserves.players.map(age) };

  // 2. College rosters; named Seniors go to the draft.
  const setup = setupCollegeRosters({ season: n, prev: state.prevCollege, proIds: new Set() });
  if (!setup.ok) return setup;
  const prospects: DraftProspect[] = [];
  let xSeniors = 0;
  for (const [teamId, entries] of Object.entries(state.prevCollege.teams)) {
    for (const e of entries) {
      if (e.playerId === null || e.classYear !== 'Sr') continue;
      if (players.players[e.playerId]?.name == null) {
        xSeniors++;
        continue;
      }
      prospects.push({
        playerId: e.playerId, position: e.position, college: teamId, classYear: 'Sr', senior: true,
        collegeRating: e.rating, stars: e.stars ?? null, fbaRating: null,
      });
    }
  }

  // 3. Place the S{n} board commits, in board order.
  const displaced: AdjustAgePreview['displaced'] = [];
  const portalLines: Built['portalLines'] = [];
  const problems: string[] = [];
  let placed = 0;
  let board = state.board;
  let rosters = setup.rosters;
  if (state.board) {
    let rs: RecruitingState = {
      season: n, recruiting: state.board, rosters, teams: state.collegeTeams, players, tx: state.collegeTx, calendar: state.calendar,
    };
    for (const p of [...state.board.recruits, ...state.board.portal].filter(x => x.committedTo)) {
      const teamId = p.committedTo!;
      const school = schoolName(rs, teamId);
      const slot = slotFor(rs, p, teamId, school);
      if (!slot.ok) {
        problems.push(slot.problem);
        continue;
      }
      let recruiting = rs.recruiting;
      if (slot.displaced) {
        const d = slot.displaced;
        const dId = d.playerId!;
        const transfer: PortalPlayer = {
          playerId: dId, position: d.position, classYear: d.classYear!, rating: d.rating, stars: d.stars ?? null, projections: {}, committedTo: null, fromTeam: teamId,
        };
        recruiting = { ...recruiting, portal: [...recruiting.portal, transfer] };
        displaced.push({ playerId: dId, teamId, classYear: d.classYear!, position: d.position, rating: d.rating });
        portalLines.push({
          teamId,
          line: `${collegeName(players, dId)} (${d.classYear} ${d.position}${ratingNote(d.rating)}) enters the transfer portal from ${school}`,
        });
      }
      const entry: RosterEntry = { playerId: p.playerId, position: p.position, rating: p.rating, age: null, points: 0, stars: p.stars, classYear: p.classYear };
      const next = withTeam(rs.rosters, teamId, rs.rosters.teams[teamId].map((e, i) => (i === slot.index ? entry : e)));
      rs = { ...rs, recruiting, rosters: next };
      placed++;
    }
    if (problems.length) return { ok: false, problems };
    board = rs.recruiting;
    rosters = rs.rosters;
  }

  return {
    ok: true,
    built: {
      preview: { aged, seniors: prospects.length, xSeniors, placed, displaced },
      fba, freeAgents, d2, reserves, rosters, board, portalLines,
      draft: { league: 'fba', season: n, locked: false, started: false, prospects, picks: [] },
    },
  };
}

export function adjustAgePreview(state: AdjustAgeState): { ok: true; preview: AdjustAgePreview } | { ok: false; problems: string[] } {
  const r = build(state);
  return r.ok ? { ok: true, preview: r.built.preview } : r;
}

const count = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** Adjust Age (§2): pro ages, the S{n} college rosters, Seniors to the S{n} draft board, S{n} commits placed. One batch. */
export function adjustAge(state: AdjustAgeState, ctx: MoveContext): WritesResult {
  const r = build(state);
  if (!r.ok) return r;
  const n = state.season;
  const b = r.built;
  const { aged, seniors, xSeniors, placed } = b.preview;
  const summary = `Class years move up: ${[
    count(seniors, `Senior enters the S${n} draft`, `Seniors enter the S${n} draft`),
    count(xSeniors, 'unnamed Senior leaves', 'unnamed Seniors leave'),
    count(placed, 'commitment joins its school', 'commitments join their schools'),
  ].join(', ')}`;
  let collegeTx = appendTx(state.collegeTx, ctx, 'adjust-age', [], [summary]);
  for (const { teamId, line } of b.portalLines) collegeTx = appendTx(collegeTx, ctx, 'portal', [teamId], [line]);
  const fbaTx = appendTx(state.fbaTx, ctx, 'adjust-age', [], [count(aged, 'player ages a year', 'players age a year')]);
  const meta: MetaFile = { ...state.meta, rosterSeason: { ...state.meta.rosterSeason, fbajc: n } };

  const writes: { path: string; doc: unknown }[] = [{ path: docPath('fba', n), doc: b.fba }];
  if (b.freeAgents) writes.push({ path: docPath('freeAgents', n), doc: b.freeAgents });
  writes.push({ path: docPath('d2', n), doc: b.d2 });
  if (b.reserves) writes.push({ path: docPath('reserves', n), doc: b.reserves });
  writes.push({ path: `leagues/fbajc/S${n}/rosters.json`, doc: b.rosters });
  if (b.board && placed > 0) writes.push({ path: boardPath(n - 1), doc: b.board });
  writes.push(
    { path: draftPath(n), doc: b.draft },
    { path: 'meta.json', doc: meta },
    { path: 'calendar.json', doc: markStepDone(state.calendar, ADJUST_AGE_STEP) },
    { path: docPath('fbaTx', n), doc: fbaTx },
    { path: `leagues/fbajc/S${n}/transactions.json`, doc: collegeTx },
  );
  return { ok: true, writes, label: `Adjust Age (S${n})` };
}
