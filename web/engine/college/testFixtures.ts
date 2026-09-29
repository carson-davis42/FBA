import type { ClassDraftRow, ClassYear, PlayersFile, Position, RosterEntry, RostersFile, TeamsFile } from '../shared/types';
import { createClass } from './recruiting';
import { setupCollegeRosters } from './setup';
import { emptyRecruiting, type RecruitingState } from './state';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };

/** Baylor and Texas (Big 12), Duke (ACC). */
export function collegeTeams(): TeamsFile {
  return {
    league: 'fbajc',
    teams: [
      { teamId: 'BAY', name: 'Baylor', abbr: 'BAY', group: 'B12', logoFolder: null, badge },
      { teamId: 'TEX', name: 'Texas', abbr: 'TEX', group: 'B12', logoFolder: null, badge },
      { teamId: 'DUKE', name: 'Duke', abbr: 'DUKE', group: 'ACC', logoFolder: null, badge },
    ],
  };
}

const NAMED: Record<string, string> = { p00485: 'Jaden Moss', p00488: 'Omar Reed', p00503: 'Luis Vega', p00510: 'Ty Brooks' };
const UNNAMED = ['p00486', 'p00487', 'p00489', 'p00500', 'p00502', 'p00504', 'p00511', 'p00512', 'p00513', 'p00514'];

/** Every college player in the fixtures (unnamed ones are "X"); the next id is p01914, as in the real S79 data. */
export function collegePlayers(): PlayersFile {
  const players: PlayersFile['players'] = {};
  for (const [id, name] of Object.entries(NAMED)) players[id] = { id, name, birthSeason: null };
  for (const id of UNNAMED) players[id] = { id, name: null, birthSeason: null };
  return { nextId: 1914, players };
}

const c = (playerId: string | null, position: Position, classYear: ClassYear, rating: number, stars: number | null = null): RosterEntry =>
  (playerId === null
    ? { playerId: null, position, rating: null, age: null, points: 0, stars: null, classYear: null }
    : { playerId, position, rating, age: null, points: 300, stars, classYear });

/**
 * S78 college rosters, 300 points each:
 * - BAY: PG Jaden Moss p00485 (Fr, 82, 4★) · SG X p00486 (Sr, 70) · SF X p00487 (So, 72) · PF Omar Reed p00488 (Jr, 69) · C X p00489 (Sr, 74).
 * - TEX: PG X p00500 (Jr, 88, 5★; now in the pros) · SG hole · SF X p00502 (Fr, 75) · PF Luis Vega p00503 (So, 66) · C X p00504 (Jr, 71).
 * - DUKE: PG Ty Brooks p00510 (Sr, 90; now in the pros) · SG X p00511 (Fr, 60) · SF X p00512 (So, 61) · PF X p00513 (Sr, 62) · C X p00514 (Fr, 63).
 *
 * Set up for S79 (with collegeProIds), this gives:
 * - BAY: PG Jaden Moss (So, 82, 4★) · SG hole · SF X (Jr, 72) · PF Omar Reed (Sr, 69) · C hole.
 * - TEX: PG hole · SG hole · SF X (So, 75) · PF Luis Vega (Jr, 66) · C X (Sr, 71).
 * - DUKE: PG hole · SG X p00511 (So, 60) · SF X (Jr, 61) · PF hole · C X (So, 63).
 */
export function collegeS78Rosters(): RostersFile {
  return {
    league: 'fbajc',
    season: 78,
    locked: true,
    teams: {
      BAY: [c('p00485', 'PG', 'Fr', 82, 4), c('p00486', 'SG', 'Sr', 70), c('p00487', 'SF', 'So', 72), c('p00488', 'PF', 'Jr', 69), c('p00489', 'C', 'Sr', 74)],
      TEX: [c('p00500', 'PG', 'Jr', 88, 5), c(null, 'SG', 'Fr', 0), c('p00502', 'SF', 'Fr', 75), c('p00503', 'PF', 'So', 66), c('p00504', 'C', 'Jr', 71)],
      DUKE: [c('p00510', 'PG', 'Sr', 90), c('p00511', 'SG', 'Fr', 60), c('p00512', 'SF', 'So', 61), c('p00513', 'PF', 'Sr', 62), c('p00514', 'C', 'Fr', 63)],
    },
  };
}

/** S79 FBA rosters (Ty Brooks, drafted, plus a vacancy) and D2 rosters (the early leaver p00500). */
export function collegePros(): { fba: RostersFile; d2: RostersFile } {
  return {
    fba: { league: 'fba', season: 79, locked: false, teams: { BOS: [
      { playerId: 'p00510', position: 'PG', rating: 70, age: 22, points: 0 },
      { playerId: null, position: 'SG', rating: null, age: null, points: 0 },
    ] } },
    d2: { league: 'fbad2', season: 79, locked: false, teams: { AMS: [{ playerId: 'p00500', position: 'PG', rating: 72, age: 21, points: 0 }] } },
  };
}

/** The S78 college players now in the S79 pro data. */
export function collegeProIds(): Set<string> {
  return new Set(['p00500', 'p00510']);
}

/**
 * S79 FBAJC after the one-time setup (see collegeS78Rosters for the rosters), before the S80 class exists.
 * Calendar: FBAD2 Draft done, then Create S80 Class (current), Make S79 Schedules, FBAJC.
 */
export function collegeBaseState(): RecruitingState {
  const set = setupCollegeRosters({ season: 79, prev: collegeS78Rosters(), proIds: collegeProIds() });
  if (!set.ok) throw new Error(set.problems.join('; '));
  return {
    season: 79,
    recruiting: emptyRecruiting(79),
    rosters: set.rosters,
    teams: collegeTeams(),
    players: collegePlayers(),
    tx: { league: 'fbajc', season: 79, entries: [] },
    calendar: {
      season: 79,
      steps: [
        { id: 'fbad2-draft', label: 'FBAD2 Draft', kind: 'offseason', league: null, sub: true, done: true },
        { id: 'create-s80-class', label: 'Create S80 Class', kind: 'offseason', league: null, sub: false, done: false },
        { id: 'make-s79-schedules', label: 'Make S79 Schedules', kind: 'offseason', league: null, sub: false, done: false },
        { id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: false },
      ],
    },
  };
}

export const CLASS_DRAFT: ClassDraftRow[] = [
  { name: 'Zion Carter', position: 'PG' }, { name: 'Malik Ford', position: 'SG' }, { name: 'Eli Grant', position: 'PF' },
];

/** collegeBaseState with the S80 class created from CLASS_DRAFT: Zion Carter PG p01914, Malik Ford SG p01915, Eli Grant PF p01916. */
export function collegeClassState(): RecruitingState {
  const s = collegeBaseState();
  const r = createClass({ ...s, recruiting: { ...s.recruiting, classDraft: CLASS_DRAFT } }, { batchId: 'fixture' });
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
}
