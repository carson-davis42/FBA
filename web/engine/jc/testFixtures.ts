import { mulberry32, type Rng } from '../d2/random';
import type { JcScheduleFile, RosterEntry } from '../shared/types';
import { challengeSets, conferenceDays } from './schedule';
import type { JcState } from './state';
import { playToEnd } from './play';
import { dayGames, makeFields } from './tournaments';

const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };

/** A started FBAJC season: 216 teams in 18 conferences of 12, five rated players each, `fbajc` as the current calendar step, a full schedule (days 2 and 3 still empty), no results. */
export function jcStateFixture(seed = 7, season = 79): JcState {
  const rng: Rng = mulberry32(seed);
  const confs: Record<string, string[]> = {};
  const teams: JcState['teams']['teams'] = [];
  const rosterTeams: Record<string, RosterEntry[]> = {};
  const names: Record<string, { id: string; name: string | null; birthSeason: null }> = {};
  let id = 1;
  for (let c = 0; c < 18; c++) {
    const group = `Conf ${String(c + 1).padStart(2, '0')}`;
    confs[group] = [];
    for (let t = 0; t < 12; t++) {
      const teamId = `C${String(c).padStart(2, '0')}T${String(t).padStart(2, '0')}`;
      confs[group].push(teamId);
      teams.push({ teamId, name: `${teamId} U`, abbr: teamId, group, logoFolder: null, badge });
      rosterTeams[teamId] = POS.map((position, k) => {
        const playerId = `p${String(id++).padStart(5, '0')}`;
        names[playerId] = { id: playerId, name: `${teamId} ${position}`, birthSeason: null };
        return { playerId, position, rating: 55 + Math.floor(rng() * 35), age: null, points: 0, stars: null, classYear: (['Fr', 'So', 'Jr', 'Sr', 'Fr'] as const)[k] };
      });
    }
  }
  const allIds = teams.map(t => t.teamId);
  const fields = makeFields({ confs, preseasonTop25: allIds.slice(0, 25), lastChampion: null, lastRunnerUp: null }, rng);
  const days: JcScheduleFile['days'] = [];
  days.push({ day: 1, kind: 'tournament', games: dayGames(1, fields, [], 1, rng) });
  days.push({ day: 2, kind: 'tournament', games: [] });
  days.push({ day: 3, kind: 'tournament', games: [] });
  const sets = challengeSets(confs, rng);
  const rounds = conferenceDays(confs, rng);
  const mk = (day: number, pairs: [string, string][]) => pairs.map(([home, away], i) => ({ gameNo: (day - 1) * 108 + i + 1, home, away }));
  sets.forEach((set, i) => days.push({ day: 4 + i, kind: 'challenge', games: mk(4 + i, set) }));
  rounds.forEach((r, i) => days.push({ day: 8 + i, kind: 'conference', games: mk(8 + i, r) }));
  const drawKeys: Record<string, number> = {};
  for (const t of allIds) drawKeys[t] = rng();
  return {
    season,
    teams: { league: 'fbajc', teams },
    rosters: { league: 'fbajc', season, locked: false, teams: rosterTeams },
    players: { nextId: id + 100, players: names },
    calendar: {
      season,
      steps: [{ id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: false }],
    },
    schedule: { league: 'fbajc', season, locked: false, tournaments: fields.map(f => ({ id: f.id, name: f.name, teams: f.teams })), days, drawKeys },
    results: { league: 'fbajc', season, locked: false, games: [] },
    rankings: { league: 'fbajc', season, locked: false, snapshots: [] },
    postseason: null,
    awards: null,
    summary: null,
    board: null,
  };
}

/** An unstarted FBAJC season: full rosters, no schedule, results or rankings; every player is unnamed (`name: null`). */
export function jcUnstartedFixture(seed = 7, season = 79): JcState {
  const s = jcStateFixture(seed, season);
  const players: JcState['players']['players'] = {};
  for (const [id, p] of Object.entries(s.players.players)) players[id] = { ...p, name: null };
  return { ...s, players: { ...s.players, players }, schedule: null, results: null, rankings: null };
}

/** A season whose 3132 regular-season games are all played (slow: about 10 seconds; build it once per test file). */
export function jcPlayedFixture(seed = 7, season = 79): JcState {
  const r = playToEnd(jcStateFixture(seed, season), mulberry32(seed + 100));
  if (!r.ok) throw new Error(r.problems.join());
  return r.state;
}
