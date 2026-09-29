import { describe, expect, it } from 'vitest';
import { seasonDefense } from '../awards/defense';
import { mulberry32 } from '../d2/random';
import { FINALS } from '../playoffs/bracket';
import { lockSeeds } from '../playoffs/moves';
import { fullD2State, fullFbaState, playPlayoffs, regularSeasonDone } from '../playoffs/testFixtures';
import { SummaryFile, type AllStarFile, type GameResult, type RatingPauseFile, type RostersFile } from '../shared/types';
import { recordGames, simNextGames } from './moves';
import { seasonWrites, type SeasonResult, type SeasonState } from './state';
import { d2SeasonState } from './testFixtures';
import { finishSeason, playerLines, seasonRecord } from './wrapUp';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};

const pause = (afterGame: number, rows: [string, number][]): RatingPauseFile => ({
  league: 'fba', season: 79, afterGame, locked: true,
  players: rows.map(([playerId, oldRating]) => ({ playerId, teamId: 'AAA', position: 'PG', oldRating, games: 5, ppg: 10, perf: 0, suggested: oldRating, rating: oldRating })),
});

const allStarDoc = (locked: boolean): AllStarFile => ({
  league: 'fba', season: 79, locked,
  selections: { allStars: ['p00001'], captains: [], youngStars: ['p00002'], youngCaptains: [] },
  asgDraft: null, contestDraw: null,
  fivePoint: { rounds: [], winner: 'p00003' },
  dunk: { rounds: [], winner: 'p00004' },
  ysgDraft: null, ysg: null, asg: null,
});

const fbaDone = () => playPlayoffs(ok(lockSeeds(regularSeasonDone(fullFbaState()))).state, 5);
const d2Done = () => playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6);

describe('playerLines', () => {
  const D = { def: 10, stops: 4, allowed: 12, exp: 1500 };
  const side = (ids: string[], pts: number, def: boolean) => ids.map(playerId => ({ playerId, pts, ...(def ? D : {}) }));
  const game = (gameNo: number, home: string, homeIds: string[], away: string, awayIds: string[], def = true): GameResult => ({
    gameNo, home, away, homePts: 50, awayPts: 40, box: { home: side(homeIds, 10, def), away: side(awayIds, 8, def) },
  });
  const t = (g: number, pts: number, k: number) => ({ g, pts, def: 10 * k, stops: 4 * k, allowed: 12 * k, exp: 1500 * k });
  const rosters: RostersFile = { league: 'fba', season: 79, locked: false, teams: {
    AAA: [{ playerId: 'p00002', position: 'SG', rating: 80, age: 25, points: 0 }],
    BBB: [{ playerId: 'p00001', position: 'PG', rating: 88, age: 25, points: 0 }],
  } };

  it('splits a traded player into stints plus a total, keeps the playoffs separate, and takes ratingStart from the first pause', () => {
    const regular = [
      game(1, 'AAA', ['p00001', 'p00002'], 'CCC', ['p00009'], false),
      game(2, 'CCC', ['p00009'], 'AAA', ['p00001', 'p00002']),
      game(3, 'BBB', ['p00001'], 'AAA', ['p00004', 'p00002']),
    ];
    const playoffs = [game(1, 'BBB', ['p00001'], 'CCC', ['p00009'])];
    const pauses = [pause(2, [['p00001', 86], ['p00002', 79]]), pause(1, [['p00001', 85]])];
    expect(playerLines({ regular, playoffs }, rosters, pauses)).toEqual([
      { playerId: 'p00001', teamId: 'AAA', stint: 1, position: 'PG', ratingStart: 85, ratingEnd: 88, rs: t(2, 18, 1), po: null },
      { playerId: 'p00001', teamId: 'BBB', stint: 2, position: 'PG', ratingStart: 85, ratingEnd: 88, rs: t(1, 10, 1), po: t(1, 10, 1) },
      { playerId: 'p00001', teamId: null, stint: null, position: 'PG', ratingStart: 85, ratingEnd: 88, rs: t(3, 28, 2), po: t(1, 10, 1) },
      { playerId: 'p00002', teamId: 'AAA', stint: 1, position: 'SG', ratingStart: 79, ratingEnd: 80, rs: t(3, 26, 2), po: null },
      { playerId: 'p00004', teamId: 'AAA', stint: 1, position: 'PG', ratingStart: null, ratingEnd: null, rs: t(1, 8, 1), po: null },
      { playerId: 'p00009', teamId: 'CCC', stint: 1, position: 'PG', ratingStart: null, ratingEnd: null, rs: t(2, 18, 1), po: t(1, 8, 1) },
    ]);
  });

  it('sums the same defense as the DPOY race, so points saved match', () => {
    const s = d2SeasonState();
    const { games, problem } = simNextGames(s, 4, mulberry32(1));
    expect(problem).toBeNull();
    const played = ok(recordGames(s, games)).state;
    const lines = playerLines({ regular: played.results!.games, playoffs: [] }, played.rosters, []);
    const race = seasonDefense(played.results);
    expect(lines).toHaveLength(race.size);
    for (const l of lines) {
      const d = race.get(l.playerId)!;
      expect([l.rs.g, l.rs.def, l.rs.stops, l.rs.allowed, l.rs.exp]).toEqual([d.games, d.def, d.stops, d.allowed, d.exp]);
    }
  });
});

describe('seasonRecord', () => {
  it('records the FBA champion, standings, seeds, playoff rounds, bracket and players', () => {
    const s = fbaDone();
    const pf = s.playoffs!;
    const fin = pf.series.find(x => x.id === FINALS)!;
    const loser = fin.winner === fin.home ? fin.away! : fin.home!;
    const rec = seasonRecord(s, []);
    expect(SummaryFile.safeParse(rec).success).toBe(true);
    expect(rec).toMatchObject({ league: 'fba', season: 79, locked: true, host: null, awards: [], allFba: null, allStar: null, promotion: null });
    expect(rec.champions).toEqual([{
      title: 'FBA Champion', champion: `${fin.winner} Club`, runnerUp: `${loser} Club`, score: pf.outcome!.champions[0].score,
      teamId: fin.winner, runnerUpId: loser, group: null,
    }]);
    expect(rec.bracket).toEqual({ seeds: pf.seeds, series: pf.series });
    expect(rec.standings!.map(r => r.group)).toEqual([...Array(15).fill('E'), ...Array(15).fill('W')]);
    expect(rec.standings!.filter(r => r.group === 'W').map(r => r.rank)).toEqual(Array.from({ length: 15 }, (_, k) => k + 1));
    for (const r of rec.standings!) {
      const seeds = pf.seeds.find(x => x.group === r.group)!.teams;
      expect(r.seed).toBe(seeds.includes(r.teamId) ? seeds.indexOf(r.teamId) + 1 : null);
      expect(r.playoff === null).toBe(r.seed === null);
      expect(r.name).toBe(`${r.teamId} Club`);
    }
    expect(rec.standings!.find(r => r.teamId === fin.winner)!.playoff).toEqual({ round: 4, champion: true });
    expect(rec.standings!.find(r => r.teamId === loser)!.playoff).toEqual({ round: 4, champion: false });
    // regularSeasonDone saves no box scores, so every line comes from the 16 playoff teams' games.
    expect(rec.players).toHaveLength(80);
    expect(rec.players!.every(p => p.rs.g === 0 && p.po !== null && p.po.g > 0)).toBe(true);
  });

  it('copies the All-Star results (FBA)', () => {
    const rec = seasonRecord({ ...fbaDone(), allstar: allStarDoc(true) }, []);
    expect(rec.allStar).toEqual({ allStars: ['p00001'], youngStars: ['p00002'], asgMvp: null, fivePoint: 'p00003', dunk: 'p00004' });
  });

  it('records the four D2 champions, the league snapshot and promotion', () => {
    const s = d2Done();
    const out = s.playoffs!.outcome!;
    const rec = seasonRecord(s, []);
    expect(SummaryFile.safeParse(rec).success).toBe(true);
    expect(rec.champions.map(c => [c.title, c.group])).toEqual([
      ['Premier League Champion', 'PL'], ['World League Champion', 'WL'], ['United League Champion', 'UL'], ['International League Champion', 'IL'],
    ]);
    expect(rec.champions.map(c => c.teamId)).toEqual(out.champions.map(c => c.teamId));
    expect(rec.promotion).toEqual(out.promotion);
    expect(rec.allFba).toBeNull();
    expect(rec.allStar).toBeNull();
    for (const r of rec.standings!) expect(r.group).toBe(s.teams.teams.find(t => t.teamId === r.teamId)!.group);
    expect(Math.max(...rec.standings!.map(r => r.playoff?.round ?? 0))).toBe(3);
    expect(rec.standings!.filter(r => r.playoff?.champion).map(r => r.teamId).sort()).toEqual(out.champions.map(c => c.teamId).sort());
  });
});

describe('finishSeason', () => {
  const ctx = { batchId: 'fin' };

  it('writes the locked record, locks the game docs, logs it and marks the league step done', () => {
    const s = d2Done();
    expect(s.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(false);
    const r = ok(finishSeason(s, [], ctx));
    expect(r.label).toBe('Finish S79 D2 season');
    expect(seasonWrites(r).map(w => w.path)).toEqual([
      'leagues/fbad2/S79/summary.json', 'leagues/fbad2/S79/schedule.json', 'leagues/fbad2/S79/results.json',
      'leagues/fbad2/S79/playoffs.json', 'leagues/fbad2/S79/transactions.json', 'calendar.json',
    ]);
    expect(r.state.summary).toEqual(seasonRecord(s, []));
    for (const d of [r.state.schedule, r.state.results, r.state.playoffs]) expect(d!.locked).toBe(true);
    expect(r.state.tx.entries.at(-1)).toEqual({ seq: 1, batchId: 'fin', type: 'season', teams: [], lines: ['S79 D2 season finished'] });
    expect(r.state.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(true);
  });

  it('locks an unlocked All-Star doc too, and skips docs that are already locked (FBA)', () => {
    const s = { ...fbaDone(), allstar: allStarDoc(false) };
    const r = ok(finishSeason(s, [pause(1290, [])], ctx));
    expect(r.changed).toEqual(['summary', 'schedule', 'results', 'playoffs', 'allstar', 'tx', 'calendar']);
    expect(r.state.allstar!.locked).toBe(true);
    expect(r.state.tx.entries.at(-1)!.lines).toEqual(['S79 FBA season finished']);
    expect(ok(finishSeason({ ...s, allstar: allStarDoc(true) }, [], ctx)).changed).not.toContain('allstar');
  });

  it('refuses before the last final, with unlocked awards, twice, off-step, or with an unfinished rating pause', () => {
    const s = d2Done();
    const problems = (x: SeasonState, pauses: RatingPauseFile[] = []) => {
      const r = finishSeason(x, pauses, ctx);
      return r.ok ? [] : r.problems;
    };
    const partway = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6, 10);
    expect(problems(partway)).toEqual(['Finish the playoffs first']);
    expect(problems({ ...s, awards: { ...s.awards!, locked: false } })).toEqual(['Lock the S79 awards first']);
    const finished = ok(finishSeason(s, [], ctx));
    expect(problems({ ...finished.state, calendar: s.calendar })).toEqual(['The S79 D2 season is already finished']);
    expect(problems({ ...s, calendar: finished.state.calendar })[0]).toMatch(/^The season is played at the FBA D2 step/);
    expect(problems(s, [{ ...pause(1290, []), locked: false }])).toEqual(['Finish the rating adjustments after game 1290 first']);
  });
});
