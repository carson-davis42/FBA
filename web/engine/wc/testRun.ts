import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../d2/random';
import { calendarFor } from '../shared/calendar';
import type { CalendarFile, RosterEntry, RostersFile } from '../shared/types';
import { CITY_COUNTRY } from './countries';
import { finishQualifying, playQualifyingGame, startQualifying, type QualifyingState } from './qualifying';
import { finishGroups, playGroupGame, playKnockoutGame, startWorldCup, type WorldCupState } from './worldcup';

const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const countries: string[] = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../data/leagues/fbawc/teams.json'), 'utf8')).teams.map(
  (t: { teamId: string }) => t.teamId,
);

/** 64 D2 teams x 5 players with deterministic ratings 60-90 (the real city ids first, then filler). */
export function d2Fixture(): RostersFile {
  const ids = [...Object.keys(CITY_COUNTRY), ...Array.from({ length: 64 }, (_, i) => `FILL${i}`)].slice(0, 64);
  const teams: Record<string, RosterEntry[]> = {};
  ids.forEach((id, t) => {
    teams[id] = POS.map((position, p) => ({ playerId: `p${String(t * 5 + p).padStart(5, '0')}`, position, rating: 60 + ((t * 7 + p * 11) % 31), age: 24 + (p % 5), points: 0 }));
  });
  return { league: 'fbad2', season: 80, locked: false, teams };
}

/** Qualifying plus all 31 knockout games played; `w` is not yet finished (the calendar step is still open). */
export function runFullWorldCup(seed: number) {
  const rng = mulberry32(seed);
  const host = countries[0];
  const cal79 = calendarFor(79);
  const q0 = startQualifying(
    { season: 79, calendar: { ...cal79, steps: cal79.steps.map(s => (s.id === 's79-qualifying' ? s : { ...s, done: true })) }, d2Rosters: d2Fixture(), countries, host, previousWc: null },
    rng,
  );
  if (!q0.ok) throw new Error(q0.problems.join());
  let q: QualifyingState = q0.state;
  const qStart = q0.state;
  for (let i = 0; i < 210; i++) {
    const r = playQualifyingGame(q, rng);
    if (!r.ok) throw new Error(r.problems.join());
    q = r.state;
  }
  const qf = finishQualifying(q);
  if (!qf.ok) throw new Error(qf.problems.join());
  q = qf.state;

  const cal80: CalendarFile = calendarFor(80);
  const calendar = { ...cal80, steps: cal80.steps.map(s => (s.id === 's80-world-cup' ? s : { ...s, done: true })) };
  const w0 = startWorldCup({ season: 80, calendar, d2Rosters: d2Fixture(), countries, qualifying: q.qualifying!, previous: q.rosters }, rng);
  if (!w0.ok) throw new Error(w0.problems.join());
  let w: WorldCupState = w0.state;
  const wStart = w0.state;
  for (let i = 0; i < 192; i++) {
    const r = playGroupGame(w, rng);
    if (!r.ok) throw new Error(r.problems.join());
    w = r.state;
  }
  const gf = finishGroups(w);
  if (!gf.ok) throw new Error(gf.problems.join());
  w = gf.state;
  const wKnockoutStart = gf.state;
  for (let i = 0; i < 31; i++) {
    const r = playKnockoutGame(w, rng);
    if (!r.ok) throw new Error(r.problems.join());
    w = r.state;
  }
  return { q, w, stages: { qStart, wStart, wKnockoutStart } };
}
