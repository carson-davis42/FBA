import { describe, expect, it } from 'vitest';
import { AllStarFile, AwardsFile, BoxLine, D2DraftFile, D2PoolFile, D2RatingsFile, FreeAgentsFile, GameResult, LogoManifest, MetaFile, PickObligation, PicksFile, PlayoffsFile, RankingFile, RatingPauseFile, RecruitingFile, ReservePlayer, ResultsFile, RostersFile, ReservesFile, ScheduleFile, SummaryFile, TransactionType, TransactionsFile } from './types';

describe('schemas', () => {
  it('accepts a valid roster document', () => {
    const doc = {
      league: 'fba', season: 79, locked: false,
      teams: { BOS: [{ playerId: 'p00001', position: 'PG', rating: 95, age: 28, points: 0, contractEnd: 80, contractAmount: 8 }] },
    };
    expect(RostersFile.safeParse(doc).success).toBe(true);
  });

  it('accepts a vacant roster slot', () => {
    const doc = { league: 'fba', season: 79, locked: false, teams: { CAR: [{ playerId: null, position: 'C', rating: null, age: null, points: 0 }] } };
    expect(RostersFile.safeParse(doc).success).toBe(true);
  });

  it('rejects an unknown position', () => {
    const doc = { league: 'fba', season: 79, locked: false, teams: { BOS: [{ playerId: 'p00001', position: 'G', rating: 95, age: 28, points: 0 }] } };
    expect(RostersFile.safeParse(doc).success).toBe(false);
  });

  it('requires every league in meta', () => {
    const doc = { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } };
    expect(MetaFile.safeParse(doc).success).toBe(false);
  });

  it('rejects a roster entry with an unknown key', () => {
    const doc = {
      league: 'fba', season: 79, locked: false,
      teams: { BOS: [{ playerId: 'p00001', position: 'PG', rating: 95, age: 28, points: 0, bogus: 1 }] },
    };
    expect(RostersFile.safeParse(doc).success).toBe(false);
  });

  it('rejects a game result with an unknown key', () => {
    const doc = { league: 'fba', season: 79, locked: false, games: [{ gameNo: 1, home: 'BOS', away: 'CAR', homePts: 100, awayPts: 90, unknown: 0 }] };
    expect(ResultsFile.safeParse(doc).success).toBe(false);
  });

  it('rejects logo manifest entries that are paths', () => {
    expect(LogoManifest.safeParse({ folders: { x: [{ file: '../../etc/passwd.png', from: null, to: null, variant: 1 }] } }).success).toBe(false);
    expect(LogoManifest.safeParse({ folders: { '../x': [] } }).success).toBe(false);
    expect(LogoManifest.safeParse({ folders: { 'Boston Bucks': [{ file: 'Boston Bucks S61-pres..png', from: 61, to: null, variant: 0 }] } }).success).toBe(true);
  });
});

describe('roster-move schemas', () => {
  it('accepts a restricted roster entry', () => {
    const doc = { league: 'fba', season: 79, locked: false, teams: { ATL: [{ playerId: 'p00004', position: 'PF', rating: 75, age: 20, points: 0, contractEnd: 79, contractAmount: 2, restricted: true }] } };
    expect(RostersFile.safeParse(doc).success).toBe(true);
  });

  it('validates free agents and reserves', () => {
    expect(FreeAgentsFile.safeParse({ league: 'fba', season: 79, locked: false, players: [{ playerId: 'p01000', position: 'C', age: 22, rating: null, rookie: true, note: 'R' }] }).success).toBe(true);
    expect(FreeAgentsFile.safeParse({ league: 'fbad2', season: 79, locked: false, players: [] }).success).toBe(false);
    expect(ReservesFile.safeParse({ league: 'fbad2', season: 79, locked: false, players: [{ playerId: 'p01001', position: 'PG', age: 30, rating: null }] }).success).toBe(true);
  });

  it('validates pick obligations and their conditions', () => {
    const ob = {
      id: 'imp-S80-DCB-1', season: 80, originalTeam: 'DCB', owner: 'OV',
      condition: { kind: 'top', n: 9 }, originalCondition: { kind: 'lottery' },
      originSeason: 75, priority: 1, rolls: [], note: '',
    };
    expect(PickObligation.safeParse(ob).success).toBe(true);
    expect(PickObligation.safeParse({ ...ob, condition: { kind: 'top', n: 0 } }).success).toBe(false);
    expect(PickObligation.safeParse({ ...ob, condition: { kind: 'swap', otherTeam: 'SAS', betterTo: 'DCB' } }).success).toBe(true);
    expect(PicksFile.safeParse({ league: 'fba', obligations: [ob] }).success).toBe(true);
  });

  it('validates transactions', () => {
    const tx = { league: 'fba', season: 79, entries: [{ seq: 1, batchId: 'b1', type: 'signed', teams: ['CAR'], lines: ['Signed C-Azubuike Okoro (2/$2, thru S80)'] }] };
    expect(TransactionsFile.safeParse(tx).success).toBe(true);
    expect(TransactionsFile.safeParse({ ...tx, entries: [{ ...tx.entries[0], type: 'waived' }] }).success).toBe(false);
  });
});

describe('D2 cycle schemas', () => {
  const row = { playerId: 'p00001', position: 'PG', age: 24, team: 'AMS', oldRating: 80, suggested: 82, breakdown: { age: 2, perf: 0, luck: 0 }, rating: 82 };

  it('accepts a ratings file and rejects out-of-range ratings', () => {
    const blank = { ...row, playerId: 'p00002', team: null, oldRating: null, suggested: null, breakdown: null, rating: null };
    const doc = { league: 'fbad2', season: 79, locked: false, players: [row, blank] };
    expect(D2RatingsFile.safeParse(doc).success).toBe(true);
    expect(D2RatingsFile.safeParse({ ...doc, players: [{ ...row, rating: 100 }] }).success).toBe(false);
    expect(D2RatingsFile.safeParse({ ...doc, players: [{ ...row, rating: 0 }] }).success).toBe(false);
  });

  it('requires every position in the pool order', () => {
    const order = { PG: ['p00001'], SG: [], SF: [], PF: [], C: [] };
    expect(D2PoolFile.safeParse({ league: 'fbad2', season: 79, locked: false, order }).success).toBe(true);
    const { C: _c, ...missingC } = order;
    expect(D2PoolFile.safeParse({ league: 'fbad2', season: 79, locked: false, order: missingC }).success).toBe(false);
  });

  it('accepts a draft with made and skipped picks', () => {
    const doc = {
      league: 'fbad2', season: 79, locked: false, tickets: ['AMS', 'BER'], pool: ['p00001'],
      picks: [{ teamId: 'AMS', playerId: 'p00001', position: 'PG' }, { teamId: 'BER', playerId: null, position: null }],
    };
    expect(D2DraftFile.safeParse(doc).success).toBe(true);
  });

  it('allows the fromFba tag on Reserves and the new transaction types', () => {
    expect(ReservePlayer.safeParse({ playerId: 'p00001', position: 'C', age: 22, rating: null, fromFba: true }).success).toBe(true);
    for (const t of ['drafted', 'd2-pool', 'd2-ratings']) expect(TransactionType.safeParse(t).success).toBe(true);
  });
});

describe('season schemas', () => {
  it('keeps old results valid and accepts the new optional fields', () => {
    const old = { gameNo: 1, home: 'OAK', away: 'MW', homePts: 79, awayPts: 88 };
    expect(GameResult.safeParse(old).success).toBe(true);
    const full = {
      ...old, ot: 1,
      periods: { home: [20, 20, 20, 19, 0], away: [22, 22, 22, 13, 9] },
      box: { home: [{ playerId: 'p00001', pts: 30 }], away: [{ playerId: 'p00002', pts: 40 }] },
    };
    expect(GameResult.safeParse(full).success).toBe(true);
    expect(GameResult.safeParse({ ...old, bogus: 1 }).success).toBe(false);
  });

  it('validates a schedule with pauses', () => {
    const doc = {
      league: 'fba', season: 79, locked: false,
      games: [{ gameNo: 1, home: 'BOS', away: 'CAR' }],
      pauses: [{ afterGame: 322, kind: 'ratings', done: false }, { afterGame: 645, kind: 'deadline', done: false }],
    };
    expect(ScheduleFile.safeParse(doc).success).toBe(true);
    expect(ScheduleFile.safeParse({ ...doc, league: 'fbajc' }).success).toBe(false);
    expect(ScheduleFile.safeParse({ ...doc, pauses: [{ afterGame: 1, kind: 'lunch', done: false }] }).success).toBe(false);
  });

  it('validates a rating pause', () => {
    const row = { playerId: 'p00001', teamId: 'BOS', position: 'PG', oldRating: 95, games: 20, ppg: 31.5, perf: 1, suggested: 96, rating: 96 };
    expect(RatingPauseFile.safeParse({ league: 'fba', season: 79, afterGame: 322, locked: false, players: [row] }).success).toBe(true);
    expect(RatingPauseFile.safeParse({ league: 'fba', season: 79, afterGame: 322, locked: false, players: [{ ...row, perf: 3 }] }).success).toBe(false);
  });

  it('validates an empty and a partly filled All-Star doc', () => {
    const empty = {
      league: 'fba', season: 79, locked: false, selections: null, asgDraft: null, contestDraw: null,
      fivePoint: null, dunk: null, ysgDraft: null, ysg: null, asg: null,
    };
    expect(AllStarFile.safeParse(empty).success).toBe(true);
    const game = {
      teams: [0, 1], scores: [7, 5], rollOff: null, winner: 0,
      rolls: [[{ team: 0, playerId: 'p00001', dice: [3, 4] }, { team: 1, playerId: 'p00002', dice: [2, 3] }]],
    };
    const partial = {
      ...empty,
      selections: { allStars: ['p00001'], captains: [], youngStars: [], youngCaptains: [] },
      asgDraft: { first: 1, picks: ['p00003'] },
      contestDraw: { order: ['BOS', 'CAR'], turns: [{ teamId: 'BOS', contest: '5pt', playerId: 'p00001' }, { teamId: 'CAR', contest: null, playerId: null }] },
      fivePoint: {
        winner: 'p00001',
        rounds: [{ players: ['p00001'], rolls: { p00001: [[1, 2], [3, 4], [5, 6]] }, totals: { p00001: 21 }, advanced: ['p00001'], rollOffs: [] }],
      },
      asg: { game, mvp: 'p00001', mvpRollOff: { ids: ['p00001', 'p00003'], rounds: [{ p00001: [6, 6], p00003: [1, 1] }] } },
    };
    expect(AllStarFile.safeParse(partial).success).toBe(true);
    expect(AllStarFile.safeParse({ ...partial, asgDraft: { first: 2, picks: [] } }).success).toBe(false);
    expect(AllStarFile.safeParse({ ...partial, asg: { ...partial.asg, game: { ...game, rolls: [[{ team: 0, playerId: 'p00001', dice: [7, 1] }]] } } }).success).toBe(false);
  });
});


describe('PlayoffsFile', () => {
  const r1 = (over: Record<string, unknown> = {}) => ({
    id: 'E-R1-1', group: 'E', round: 1, home: 'BOS', away: 'CAR', homeSeed: 1, awaySeed: 8,
    homeWins: 0, awayWins: 0, winner: null, next: 'E-SF-1', ...over,
  });
  const sf = { id: 'E-SF-1', group: 'E', round: 2, home: null, away: null, homeSeed: null, awaySeed: null, homeWins: 0, awayWins: 0, winner: null, next: null };
  const game = (over: Record<string, unknown> = {}) => ({
    gameNo: 1, home: 'BOS', away: 'CAR', homePts: 80, awayPts: 70, seriesId: 'E-R1-1', gameInSeries: 1, ...over,
  });
  const doc = (over: Record<string, unknown> = {}) => ({
    league: 'fba', season: 79, locked: false,
    seeds: [{ group: 'E', teams: ['BOS', 'DET', 'CIN', 'MAI', 'MAN', 'CAR', 'COL', 'DCB'], notes: ['MAN over CAR: conference record 37–19 vs 30–26'] }],
    series: [r1(), sf], queue: ['E-R1-1'], games: [], outcome: null, ...over,
  });

  it('accepts a fresh bracket and one played game', () => {
    expect(PlayoffsFile.safeParse(doc()).success).toBe(true);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 1 }), sf], games: [game()] })).success).toBe(true);
  });

  it('accepts a finished series with its winner and a D2 promotion outcome', () => {
    const done = r1({ homeWins: 4, awayWins: 1, winner: 'BOS' });
    const games = [1, 2, 3, 4, 5].map(n => game({ gameNo: n, gameInSeries: n, homePts: n === 3 ? 60 : 80 }));
    const outcome = { champions: [{ group: 'E', teamId: 'BOS', runnerUp: 'CAR', score: '4–1' }], promotion: [{ league: 'WL', promoted: ['A', 'B'], relegated: ['C', 'D'] }] };
    expect(PlayoffsFile.safeParse(doc({ series: [done, sf], queue: [], games, outcome })).success).toBe(true);
  });

  it('rejects a winner without 4 wins, and 4 wins without a winner', () => {
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 3, winner: 'BOS' }), sf], queue: [], games: [1, 2, 3].map(n => game({ gameNo: n, gameInSeries: n })) })).success).toBe(false);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 4 }), sf], queue: [], games: [1, 2, 3, 4].map(n => game({ gameNo: n, gameInSeries: n })) })).success).toBe(false);
  });

  it('rejects an unknown next series, and games that disagree with their series', () => {
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ next: 'E-SF-9' }), sf] })).success).toBe(false);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 1 }), sf], games: [game({ home: 'DET' })] })).success).toBe(false);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 1 }), sf], games: [game({ gameInSeries: 2 })] })).success).toBe(false);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 2 }), sf], games: [game()] })).success).toBe(false);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 1 }), sf], games: [game({ gameNo: 2 })] })).success).toBe(false);
  });

  it('rejects a queue with a finished series or a series missing a team', () => {
    expect(PlayoffsFile.safeParse(doc({ queue: ['E-R1-1', 'E-SF-1'] })).success).toBe(false);
    const done = r1({ homeWins: 4, winner: 'BOS' });
    const games = [1, 2, 3, 4].map(n => game({ gameNo: n, gameInSeries: n }));
    expect(PlayoffsFile.safeParse(doc({ series: [done, sf], queue: ['E-R1-1'], games })).success).toBe(false);
  });

  it('needs exactly 8 seeded teams per group and rejects unknown keys', () => {
    expect(PlayoffsFile.safeParse(doc({ seeds: [{ group: 'E', teams: ['BOS'], notes: [] }] })).success).toBe(false);
    expect(PlayoffsFile.safeParse({ ...doc(), extra: 1 }).success).toBe(false);
  });
});

describe('BoxLine defensive fields', () => {
  it('accepts lines with and without the defensive stats', () => {
    expect(BoxLine.safeParse({ playerId: 'p00001', pts: 20 }).success).toBe(true);
    expect(BoxLine.safeParse({ playerId: 'p00001', pts: 20, def: 11, stops: 6, allowed: 12, exp: 1480 }).success).toBe(true);
    expect(BoxLine.safeParse({ playerId: 'p00001', pts: 20, def: -1 }).success).toBe(false);
    expect(BoxLine.safeParse({ playerId: 'p00001', pts: 20, exp: 1.5 }).success).toBe(false);
  });
});

describe('AwardsFile', () => {
  const slot = (s: string, playerId: string | null) => ({ slot: s, playerId, teamId: playerId ? 'BOS' : null });
  const team = (ids: (string | null)[]) => ['G', 'F', 'C', 'ANY', 'ANY'].map((s, k) => slot(s, ids[k]));
  const fba = (over: Record<string, unknown> = {}) => ({
    league: 'fba', season: 79, locked: false,
    awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'HON' }, { award: 'DPOY', playerId: 'p00002', teamId: 'CAR' }],
    allFba: { team1: team(['a1', 'a2', 'a3', 'a4', 'a5']), team2: team(['b1', 'b2', 'b3', null, 'b5']) },
    ...over,
  });

  it('accepts an FBA draft with an unfilled slot and a D2 doc without All-FBA', () => {
    expect(AwardsFile.safeParse(fba()).success).toBe(true);
    const d2 = { league: 'fbad2', season: 79, locked: true, awards: [{ award: 'MVP-PL', playerId: 'p01001', teamId: 'SALZ' }], allFba: null };
    expect(AwardsFile.safeParse(d2).success).toBe(true);
  });

  it('rejects duplicate awards, awards from the other league, and All-FBA in the D2', () => {
    expect(AwardsFile.safeParse(fba({ awards: [{ award: 'MVP', playerId: 'p1', teamId: 'A' }, { award: 'MVP', playerId: 'p2', teamId: 'B' }] })).success).toBe(false);
    expect(AwardsFile.safeParse(fba({ awards: [{ award: 'MVP-PL', playerId: 'p1', teamId: 'A' }] })).success).toBe(false);
    const d2 = { league: 'fbad2', season: 79, locked: false, awards: [], allFba: fba().allFba };
    expect(AwardsFile.safeParse(d2).success).toBe(false);
  });

  it('rejects All-FBA slots out of order and a player on both teams', () => {
    const swapped = { team1: [slot('F', 'a1'), slot('G', 'a2'), slot('C', 'a3'), slot('ANY', 'a4'), slot('ANY', 'a5')], team2: team(['b1', 'b2', 'b3', 'b4', 'b5']) };
    expect(AwardsFile.safeParse(fba({ allFba: swapped })).success).toBe(false);
    expect(AwardsFile.safeParse(fba({ locked: true, allFba: { team1: team(['a1', 'a2', 'a3', 'a4', 'a5']), team2: team(['a1', 'b2', 'b3', 'b4', 'b5']) } })).success).toBe(false);
  });

  it('allows a player on both All-FBA teams in an unlocked draft, but not once locked', () => {
    const allFba = { team1: team(['a1', 'a2', 'a3', 'a4', 'a5']), team2: team(['a1', 'a2', 'b3', 'b4', 'b5']) };
    expect(AwardsFile.safeParse(fba({ allFba })).success).toBe(true);
    expect(AwardsFile.safeParse(fba({ locked: true, allFba })).success).toBe(false);
  });
});

describe('SummaryFile season record', () => {
  const totals = { g: 50, pts: 1100, def: 3000, stops: 1700, allowed: 2600, exp: 264100 };
  const line = (over: Record<string, unknown> = {}) => ({
    playerId: 'p00001', teamId: 'BOS', stint: 1, position: 'PG', ratingStart: 84, ratingEnd: 86, rs: totals, po: null, ...over,
  });
  const standing = (teamId: string) => ({
    teamId, name: `${teamId} Club`, group: 'E', rank: 1, w: 60, l: 26, confW: 40, confL: 16, diff: -12, marker: '*', seed: 1, playoff: { round: 4, champion: true },
  });
  const record = (over: Record<string, unknown> = {}) => ({
    league: 'fba', season: 79, locked: true, host: null,
    champions: [{ title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4–1', teamId: 'BOS', runnerUpId: 'MEM', group: null }],
    awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'BOS' }],
    allFba: null,
    allStar: { allStars: ['p00001'], youngStars: [], asgMvp: 'p00001', fivePoint: null, dunk: null },
    standings: [standing('BOS'), standing('MEM')],
    bracket: { seeds: [], series: [] },
    promotion: null,
    players: [line(), line({ stint: 2, teamId: 'MEM', po: totals }), line({ stint: null, teamId: null })],
    ...over,
  });

  it('accepts a full S79 record and the bare S78 shape', () => {
    expect(SummaryFile.safeParse(record()).success).toBe(true);
    const s78 = { league: 'fba', season: 78, locked: true, host: null, champions: [{ title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4-1' }] };
    expect(SummaryFile.safeParse(s78).success).toBe(true);
  });

  it('keeps All-FBA and All-Star to the FBA, and promotion to the D2', () => {
    expect(SummaryFile.safeParse(record({ league: 'fbad2' })).success).toBe(false);
    expect(SummaryFile.safeParse(record({ league: 'fbad2', allStar: null })).success).toBe(true);
    expect(SummaryFile.safeParse(record({ promotion: [{ league: 'WL', promoted: [], relegated: [] }] })).success).toBe(false);
    expect(SummaryFile.safeParse(record({ league: 'fbad2', allStar: null, promotion: [{ league: 'WL', promoted: ['A', 'B'], relegated: [] }] })).success).toBe(true);
  });

  it('rejects duplicate stint lines, a total without two stints, a half-total line, and duplicate standings teams', () => {
    expect(SummaryFile.safeParse(record({ players: [line(), line()] })).success).toBe(false);
    expect(SummaryFile.safeParse(record({ players: [line(), line({ stint: null, teamId: null })] })).success).toBe(false);
    expect(SummaryFile.safeParse(record({ players: [line({ stint: null })] })).success).toBe(false);
    expect(SummaryFile.safeParse(record({ standings: [standing('BOS'), standing('BOS')] })).success).toBe(false);
  });
});

describe('TransactionsFile lock and season entries', () => {
  const entry = { seq: 1, batchId: 'b1', type: 'season', teams: [], lines: ['S79 FBA season finished'] };
  it('accepts a season entry, with and without locked', () => {
    expect(TransactionsFile.safeParse({ league: 'fba', season: 79, entries: [entry] }).success).toBe(true);
    expect(TransactionsFile.safeParse({ league: 'fba', season: 79, locked: true, entries: [entry] }).success).toBe(true);
    expect(TransactionsFile.safeParse({ league: 'fba', season: 79, locked: 'yes', entries: [] }).success).toBe(false);
  });
});

describe('Part 7a schemas', () => {
  const row = (playerId: string, prevRating: number | null) =>
    ({ playerId, position: 'PG', age: 25, team: 'AMS', prevRating, otherRating: null, stat: null });
  const ranking = {
    league: 'fbad2', season: 79, kind: 'd2-reset', locked: false,
    rows: [row('p00001', 80), row('p00002', null)],
    order: ['p00001'],
    ratings: { p00001: 81, p00002: 70 },
    curve: [80, 75],
  };
  const ok = (patch: object) => RankingFile.safeParse({ ...ranking, ...patch }).success;

  it('accepts a ranking in progress, where a sent-back row keeps its rating', () => {
    expect(ok({})).toBe(true);
    expect(ok({ rows: [{ ...row('p00001', 80), team: null, stat: '412 pts', otherRating: 71 }, row('p00002', null)] })).toBe(true);
  });

  it('rejects duplicate rows, unknown or repeated ranks, unknown ratings, a rising curve, bad ratings and unknown kinds', () => {
    expect(ok({ rows: [row('p00001', 80), row('p00001', 70)] })).toBe(false);
    expect(ok({ order: ['p00001', 'p00001'] })).toBe(false);
    expect(ok({ order: ['p00009'] })).toBe(false);
    expect(ok({ ratings: { p00009: 70 } })).toBe(false);
    expect(ok({ curve: [75, 80] })).toBe(false);
    expect(ok({ curve: [100] })).toBe(false);
    expect(ok({ ratings: { p00001: 100 } })).toBe(false);
    expect(ok({ ratings: { p00001: 0 } })).toBe(false);
    expect(ok({ kind: 'fba-reset' })).toBe(false);
  });

  it('only locks a ranking that ranks and rates everyone', () => {
    expect(ok({ locked: true })).toBe(false);
    expect(ok({ locked: true, order: ['p00001', 'p00002'] })).toBe(true);
    expect(ok({ locked: true, order: ['p00001', 'p00002'], ratings: { p00001: 81 } })).toBe(false);
  });

  const recruit = { playerId: 'p01914', position: 'PG', classYear: 'Fr', rating: null, stars: null, projections: { TEX: 2, UH: 1 }, committedTo: null };
  const transfer = { ...recruit, playerId: 'p00485', classYear: 'Jr', rating: 78, stars: 4, projections: {}, committedTo: 'TEX', fromTeam: 'BAY' };
  const board = { league: 'fbajc', season: 79, classOf: 80, locked: false, classDraft: [], created: true, recruits: [recruit], portal: [transfer] };
  const okBoard = (patch: object) => RecruitingFile.safeParse({ ...board, ...patch }).success;

  it('accepts a recruiting board, and a class draft before the class exists', () => {
    expect(okBoard({})).toBe(true);
    expect(okBoard({ created: false, recruits: [], portal: [], classDraft: [{ name: '', position: 'C' }, { name: 'Zion Carter', position: 'PG' }] })).toBe(true);
  });

  it('rejects a wrong classOf, a player listed twice, draft rows after creation, recruits before it, and bad counts or stars', () => {
    expect(okBoard({ classOf: 81 })).toBe(false);
    expect(okBoard({ portal: [{ ...transfer, playerId: 'p01914' }] })).toBe(false);
    expect(okBoard({ classDraft: [{ name: 'Zion Carter', position: 'PG' }] })).toBe(false);
    expect(okBoard({ created: false })).toBe(false);
    expect(okBoard({ recruits: [{ ...recruit, projections: { TEX: 0 } }] })).toBe(false);
    expect(okBoard({ recruits: [{ ...recruit, stars: 2 }] })).toBe(false);
    expect(okBoard({ portal: [{ ...transfer, fromTeam: undefined }] })).toBe(false);
    expect(okBoard({ league: 'fba' })).toBe(false);
  });

  it('knows the recruiting transaction types and keeps an FBA rating on a Reserve', () => {
    for (const type of ['class', 'commit', 'portal']) expect(TransactionType.safeParse(type).success).toBe(true);
    const reserve = { playerId: 'p00041', position: 'SG', age: 23, rating: null, fromFba: true };
    expect(ReservePlayer.safeParse({ ...reserve, fbaRating: 71 }).success).toBe(true);
    expect(ReservePlayer.safeParse({ ...reserve, fbaRating: 0 }).success).toBe(false);
  });
});
