import { starsFor } from '../engine/college/classRanking';
import { emptyRecruiting, recruitingWrites, type RecruitingState } from '../engine/college/state';
import { commit } from '../engine/college/recruiting';
import type { MoveContext } from '../engine/roster/state';
import type { CalendarFile, PlayersFile, Prospect, RankingFile, RostersFile, TeamsFile, TransactionsFile } from '../engine/shared/types';
import { Report } from './report';
import { closeMatches, sameName, type SheetPlayer } from './sheets/playersTab';
import { parseSchoolCell, type ClassRow } from './sheets/recruitingClass';

export interface ClassImportInput {
  rows: ClassRow[];
  classOf: number;
  players: PlayersFile;
  teams: TeamsFile;
  rosters: RostersFile;
  tx: TransactionsFile;
  calendar: CalendarFile;
  sheet: SheetPlayer[];
}

const TOPIC = 'Recruiting class';

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Turns the class section of the FBA JC Recruiting tab into the documents for the class that plays `classOf`: new players
 * (born classOf − 18), the board at S{classOf − 1}/recruiting.json, a locked college-class ranking, and each committed
 * recruit placed through the engine's own commit() (so the X and portal rules and the transactions match the app).
 */
export function buildClassImport(input: ClassImportInput, report: Report, ctx: MoveContext): { path: string; doc: unknown }[] {
  const { classOf, teams } = input;
  const birth = classOf - 18;
  const rows = [...input.rows].sort((a, b) => a.rank - b.rank);
  const teamId = (code: string): string | null => {
    const key = norm(code);
    const t = teams.teams.find(x => norm(x.abbr) === key) ?? teams.teams.find(x => norm(x.name) === key);
    return t?.teamId ?? null;
  };

  // New players and the board.
  let nextId = input.players.nextId;
  const people = { ...input.players.players };
  const recruits: Prospect[] = [];
  const committed: { playerId: string; teamId: string; name: string }[] = [];
  for (const row of rows) {
    const id = `p${String(nextId++).padStart(5, '0')}`;
    people[id] = { id, name: row.name, birthSeason: birth };

    const found = input.sheet.find(s => sameName(s.name, row.name));
    if (!found) {
      const close = closeMatches(row.name, input.sheet).map(s => s.name);
      report.warn(TOPIC, `${row.name} isn't in the Players tab${close.length ? ` (close: ${close.join(', ')})` : ''}`);
    } else if (found.born !== birth) {
      report.warn(TOPIC, `${row.name} is born ${found.born === null ? 'before the sim' : `S${found.born}`} in the Players tab; expected S${birth}`);
    }

    const expected = starsFor(row.consensus);
    if (expected !== row.stars) {
      report.warn(TOPIC, `${row.name}: ${row.stars} stars but a consensus of ${row.consensus} means ${expected === null ? 'no star rating' : `${expected} stars`}`);
    }

    const projections: Record<string, number> = {};
    let committedTo: string | null = null;
    const cell = parseSchoolCell(row.school);
    if (cell.kind === 'committed') {
      const t = teamId(cell.school);
      if (!t) report.error(TOPIC, `${row.name}: unknown school "${cell.school}"`);
      else committed.push({ playerId: id, teamId: t, name: row.name });
    } else {
      const ids: string[] = [];
      for (const code of cell.codes) {
        const t = teamId(code);
        if (!t) report.error(TOPIC, `${row.name}: unknown school code "${code}"`);
        else ids.push(t);
      }
      if (ids.length === 1) projections[ids[0]] = Math.max(cell.count, 1);
      else for (const t of ids) projections[t] = (projections[t] ?? 0) + 1;
      if (cell.count !== cell.codes.length && cell.codes.length !== 1) {
        report.warn(TOPIC, `${row.name}: "${row.school}" says ${cell.count} PROJ but lists ${cell.codes.length} ${cell.codes.length === 1 ? 'school' : 'schools'}`);
      }
    }
    recruits.push({ playerId: id, position: row.position, classYear: 'Fr', rating: row.r, stars: row.stars, consensus: row.consensus, projections, committedTo });
  }

  // Commitments go through the engine.
  let state: RecruitingState = {
    season: classOf,
    recruiting: { ...emptyRecruiting(classOf - 1), created: true, recruits },
    rosters: input.rosters,
    teams,
    players: { nextId, players: people },
    tx: input.tx,
    calendar: input.calendar,
  };
  for (const c of committed) {
    const r = commit(state, c.playerId, c.teamId, ctx);
    if (!r.ok) report.error(TOPIC, `${c.name}: ${r.problems.join('; ')}`);
    else state = r.state;
  }

  // The class ranking gives the next Rank Class its suggestions.
  const ids = recruits.map(p => p.playerId);
  const desc = (xs: number[]) => [...xs].sort((a, b) => b - a);
  const ranking: RankingFile = {
    league: 'fbajc',
    season: classOf - 1,
    kind: 'college-class',
    locked: true,
    rows: recruits.map(p => ({ playerId: p.playerId, position: p.position, age: null, team: null, prevRating: null, otherRating: null, stat: null })),
    order: ids,
    ratings: Object.fromEntries(recruits.map(p => [p.playerId, p.rating!])),
    curve: desc(recruits.map(p => p.rating!)),
    consensus: Object.fromEntries(recruits.map(p => [p.playerId, p.consensus!])),
    consensusCurve: desc(recruits.map(p => p.consensus!)),
  };

  const writes = recruitingWrites({ ok: true, state, changed: ['recruiting', 'players', 'rosters', 'tx'], label: 'Import class' });
  return [...writes, { path: `leagues/fbajc/S${classOf - 1}/classRanking.json`, doc: ranking }];
}
