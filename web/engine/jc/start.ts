import type { Rng } from '../d2/random';
import { fbajcGateProblem } from '../college/recruiting';
import { openSpots } from '../college/walkOns';
import { calendarProblem } from '../season/moves';
import type { JcScheduleFile } from '../shared/types';
import { challengeSets, conferenceDays } from './schedule';
import { TEAMS_PER_DAY, TOTAL_GAMES, jcFail, type JcResult, type JcState } from './state';
import { blendRankings, teamRating } from './rankings';
import { dayGames, makeFields, type Field } from './tournaments';


function conferences(state: JcState): Record<string, string[]> {
  const confs: Record<string, string[]> = {};
  for (const t of state.teams.teams) (confs[t.group ?? ""] ??= []).push(t.teamId);
  return confs;
}

const toField = (f: Field) => ({ id: f.id, name: f.name, teams: f.teams });

/** Starts the season: draws, preseason ranking, tournament fields and the whole schedule. */
export function startSeason(state: JcState, rng: Rng, last: { champion: string | null; runnerUp: string | null }): JcResult {
  const step = calendarProblem(state.calendar, 'fbajc', 'The season is started');
  if (step) return jcFail([step]);
  if (state.schedule) return jcFail(['The season has already started']);
  if (openSpots(state.rosters) > 0) return jcFail(['Fill the open roster spots with walk-ons first']);
  const gate = fbajcGateProblem(state.board, state.rosters);
  if (gate) return jcFail([gate]);

  const teamIds = state.teams.teams.map(t => t.teamId);
  const confs = conferences(state);
  const drawKeys: Record<string, number> = {};
  for (const id of teamIds) drawKeys[id] = rng();
  const ratings: Record<string, number> = {};
  for (const id of teamIds) ratings[id] = teamRating(state.rosters.teams[id] ?? []);
  const preseason = blendRankings({ teams: teamIds, ratings, games: [], totalGames: TOTAL_GAMES }, rng);
  const fields = makeFields({ confs, preseasonTop25: preseason.slice(0, 25), lastChampion: last.champion, lastRunnerUp: last.runnerUp }, rng);

  const mk = (day: number, pairs: [string, string][]) => pairs.map(([home, away], i) => ({ gameNo: (day - 1) * TEAMS_PER_DAY + i + 1, home, away }));
  const days: JcScheduleFile['days'] = [
    { day: 1, kind: 'tournament', games: dayGames(1, fields, [], 1, rng) },
    { day: 2, kind: 'tournament', games: [] },
    { day: 3, kind: 'tournament', games: [] },
  ];
  challengeSets(confs, rng).forEach((set, i) => days.push({ day: 4 + i, kind: 'challenge', games: mk(4 + i, set) }));
  conferenceDays(confs, rng).forEach((r, i) => days.push({ day: 8 + i, kind: 'conference', games: mk(8 + i, r) }));

  const next: JcState = {
    ...state,
    schedule: { league: 'fbajc', season: state.season, locked: false, tournaments: fields.map(toField), days, drawKeys },
    rankings: { league: 'fbajc', season: state.season, locked: false, snapshots: [{ afterDay: 0, order: preseason }] },
    results: { league: 'fbajc', season: state.season, locked: false, games: [] },
  };
  return { ok: true, state: next, changed: ['schedule', 'rankings', 'results'], label: `Start S${state.season} season` };
}

/** Re-draws the tournament fields and day 1 while nothing has been played. */
export function redrawFields(state: JcState, rng: Rng, last: { champion: string | null; runnerUp: string | null } = { champion: null, runnerUp: null }): JcResult {
  const sched = state.schedule;
  if (!sched) return jcFail(['The season has not started']);
  if ((state.results?.games.length ?? 0) > 0) return jcFail(["Games have been played; the fields can't be re-drawn"]);
  const snap = state.rankings?.snapshots.find(s => s.afterDay === 0);
  if (!snap) return jcFail(['The preseason ranking is missing']);
  const fields = makeFields({ confs: conferences(state), preseasonTop25: snap.order.slice(0, 25), lastChampion: last.champion, lastRunnerUp: last.runnerUp }, rng);
  const days = sched.days.map(d => (d.day === 1 ? { ...d, games: dayGames(1, fields, [], 1, rng) } : d));
  return { ok: true, state: { ...state, schedule: { ...sched, tournaments: fields.map(toField), days } }, changed: ['schedule'], label: 'Re-draw tournament fields' };
}

const THRESHOLD: Record<string, number> = { Jr: 80, So: 78, Fr: 76 };

/** Unnamed players past the Java naming thresholds (Jr 80, So 78, Fr 76; Sr never). */
export function namesNeeded(state: JcState): { teamId: string; playerId: string; position: string; classYear: string; rating: number }[] {
  const out: { teamId: string; playerId: string; position: string; classYear: string; rating: number }[] = [];
  for (const [teamId, entries] of Object.entries(state.rosters.teams)) {
    for (const e of entries) {
      if (e.playerId === null || e.rating === null || !e.classYear) continue;
      if (state.players.players[e.playerId]?.name !== null) continue;
      const min = THRESHOLD[e.classYear];
      if (min !== undefined && e.rating >= min) out.push({ teamId, playerId: e.playerId, position: e.position, classYear: e.classYear, rating: e.rating });
    }
  }
  return out;
}
