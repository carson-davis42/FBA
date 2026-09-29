import { describe, expect, it } from 'vitest';
import { pathAgreementProblem, schemaForPath } from './schemaRegistry';
import { AllStarFile, AwardsFile, D2DraftFile, D2PoolFile, DraftFile, HallOfFameFile, LotteryFile, RankingFile, PlayoffsFile, RatingPauseFile, RecruitingFile, ScheduleFile } from './types';
import { seasonDocPath } from '../season/state';

describe('schemaForPath', () => {
  it.each([
    'players.json', 'meta.json', 'calendar.json', 'logos/manifest.json',
    'leagues/fba/teams.json', 'leagues/fbajc/S78/rosters.json',
    'leagues/fbad2/S78/summary.json', 'leagues/fba/S78/results.json',
  ])('knows %s', rel => {
    expect(schemaForPath(rel)).not.toBeNull();
  });

  it.each([
    '../secrets.json', 'leagues/nba/teams.json', 'leagues/fba/S78/../../x.json',
    'leagues/fba/78/rosters.json', 'players.json/extra', '', 'leagues/fba/teams9json',
    'leagues/fba/S079/rosters.json',
  ])('refuses %s', rel => {
    expect(schemaForPath(rel)).toBeNull();
  });

  it('still resolves a season without leading zeros', () => {
    expect(schemaForPath('leagues/fba/S79/rosters.json')).not.toBeNull();
  });
});

describe('part 7b paths', () => {
  it('routes the lottery and Hall of Fame documents', () => {
    expect(schemaForPath('leagues/fba/S79/lottery.json')).toBe(LotteryFile);
    expect(schemaForPath('leagues/fba/hallOfFame.json')).toBe(HallOfFameFile);
    expect(schemaForPath('leagues/fbad2/S79/lottery.json')).toBeNull();
    expect(schemaForPath('leagues/fba/S79/lottery9json')).toBeNull();
  });
});

describe('part 7d paths', () => {
  it('routes the FBA draft and pro reset documents', () => {
    expect(schemaForPath('leagues/fba/S80/draft.json')).toBe(DraftFile);
    expect(schemaForPath('leagues/fba/S80/ratings.json')).toBe(RankingFile);
    expect(schemaForPath('leagues/fba/S80/draft9json')).toBeNull();
    expect(schemaForPath('leagues/fba/S80/ratings9json')).toBeNull();
  });
});

describe('roster-move paths', () => {
  it.each([
    'leagues/fba/picks.json', 'leagues/fba/S79/freeAgents.json', 'leagues/fbad2/S79/reserves.json',
    'leagues/fba/S79/transactions.json', 'leagues/fbad2/S79/transactions.json',
  ])('knows %s', rel => {
    expect(schemaForPath(rel)).not.toBeNull();
  });

  it.each(['leagues/fbad2/picks.json', 'leagues/fbad2/S79/freeAgents.json', 'leagues/fba/S79/reserves.json'])('refuses %s', rel => {
    expect(schemaForPath(rel)).toBeNull();
  });
});

describe('D2 cycle documents', () => {
  it('knows the D2 cycle documents', () => {
    expect(schemaForPath('leagues/fbad2/S79/ratings.json')).toBe(RankingFile);
    expect(schemaForPath('leagues/fbad2/S79/pool.json')).toBe(D2PoolFile);
    expect(schemaForPath('leagues/fbad2/S79/draft.json')).toBe(D2DraftFile);
  });
});

describe('season documents', () => {
  it('knows the season documents', () => {
    expect(schemaForPath('leagues/fba/S79/schedule.json')).toBe(ScheduleFile);
    expect(schemaForPath('leagues/fbad2/S79/schedule.json')).toBe(ScheduleFile);
    expect(schemaForPath('leagues/fbajc/S79/schedule.json')).toBeNull();
    expect(schemaForPath('leagues/fba/S79/ratingPause-322.json')).toBe(RatingPauseFile);
    expect(schemaForPath('leagues/fba/S79/ratingPause-x.json')).toBeNull();
    expect(schemaForPath('leagues/fba/S79/allstar.json')).toBe(AllStarFile);
    expect(schemaForPath('leagues/fbad2/S79/allstar.json')).toBeNull();
  });
});

describe('pathAgreementProblem', () => {
  it('accepts matching league and season', () => {
    expect(pathAgreementProblem('leagues/fba/S79/rosters.json', { league: 'fba', season: 79 })).toBeNull();
    expect(pathAgreementProblem('leagues/fba/teams.json', { league: 'fba', teams: [] })).toBeNull();
    expect(pathAgreementProblem('players.json', { nextId: 1, players: {} })).toBeNull();
  });
  it('flags a league mismatch', () => {
    expect(pathAgreementProblem('leagues/fba/S79/rosters.json', { league: 'fbad2', season: 79 })).toMatch(/league/);
  });
  it('flags a season mismatch', () => {
    expect(pathAgreementProblem('leagues/fba/S79/rosters.json', { league: 'fba', season: 12 })).toMatch(/season/);
  });
});

describe('playoffs.json', () => {
  it('is registered for the FBA and D2 only', () => {
    expect(schemaForPath('leagues/fba/S79/playoffs.json')).toBe(PlayoffsFile);
    expect(schemaForPath('leagues/fbad2/S79/playoffs.json')).toBe(PlayoffsFile);
    expect(schemaForPath('leagues/fbajc/S79/playoffs.json')).toBeNull();
  });
  it('has a season doc path', () => {
    expect(seasonDocPath('playoffs', 'fbad2', 79)).toBe('leagues/fbad2/S79/playoffs.json');
  });
});

describe('awards.json', () => {
  it('is registered for the FBA and D2 only, with a season doc path', () => {
    expect(schemaForPath('leagues/fba/S79/awards.json')).toBe(AwardsFile);
    expect(schemaForPath('leagues/fbad2/S79/awards.json')).toBe(AwardsFile);
    expect(schemaForPath('leagues/fbajc/S79/awards.json')).toBeNull();
    expect(seasonDocPath('awards', 'fba', 79)).toBe('leagues/fba/S79/awards.json');
  });
});

describe('summary.json as a season doc', () => {
  it('has a season doc path', () => {
    expect(seasonDocPath('summary', 'fbad2', 79)).toBe('leagues/fbad2/S79/summary.json');
  });
});

describe('part 7a documents', () => {
  it('knows the recruiting board', () => {
    expect(schemaForPath('leagues/fbajc/S79/recruiting.json')).toBe(RecruitingFile);
    expect(schemaForPath('leagues/fba/S79/recruiting.json')).toBeNull();
  });
});

describe('part 7c documents', () => {
  it('routes the college class ranking and ratings documents', () => {
    expect(schemaForPath('leagues/fbajc/S79/classRanking.json')).toBe(RankingFile);
    expect(schemaForPath('leagues/fbajc/S79/ratings.json')).toBe(RankingFile);
    expect(schemaForPath('leagues/fba/S79/classRanking.json')).toBeNull();
  });
});
