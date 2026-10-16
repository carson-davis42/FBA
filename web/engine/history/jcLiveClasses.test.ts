import { describe, expect, it } from 'vitest';
import type { PlayersFile, RecruitingFile, TeamsFile } from '../shared/types';
import { archiveRecruitingClass, liveRecruitingClasses } from './jcLiveClasses';

const badge = { bg: '#000', fg: '#fff' };
const teams: TeamsFile = { league: 'fbajc', teams: [
  { teamId: 'UNC', name: 'North Carolina', abbr: 'UNC', group: 'ACC', logoFolder: null, badge },
  { teamId: 'DUK', name: 'Duke', abbr: 'DUK', group: 'ACC', logoFolder: null, badge },
] };
const players: PlayersFile = { nextId: 5, players: {
  p00001: { id: 'p00001', name: 'Ann Ace', birthSeason: 60 },
  p00002: { id: 'p00002', name: 'Bo Best', birthSeason: 60 },
  p00003: { id: 'p00003', name: 'Cy Mover', birthSeason: 58 },
} };
const prospect = (playerId: string, rating: number, consensus: number | null, committedTo: string | null) => ({
  playerId, position: 'PG' as const, classYear: 'Fr' as const, rating, stars: 4, consensus, projections: {}, committedTo,
});
const board = (season: number, over: Partial<RecruitingFile> = {}): RecruitingFile => ({
  league: 'fbajc', season, classOf: season + 1, locked: true, classDraft: [], created: true,
  recruits: [prospect('p00002', 90, 95.1, 'DUK'), prospect('p00001', 94, 98.8, 'UNC')],
  portal: [{ playerId: 'p00003', position: 'SF', classYear: 'Jr', rating: 85, stars: null, projections: {}, committedTo: 'DUK', fromTeam: 'UNC' }],
  ...over,
});

const have = (...seasons: number[]) => new Set(seasons);

describe('liveRecruitingClasses', () => {
  it('turns a locked board for a played season into a class: ranked recruits and the portal', () => {
    const [c] = liveRecruitingClasses([board(78)], teams, players, { have: have(78), before: 80 });
    expect(c.season).toBe(79);
    expect(c.recruits).toEqual([
      { rank: 1, stars: 4, pos: 'PG', name: 'Ann Ace', playerId: 'p00001', rating: 94, consensus: 98.8, school: 'North Carolina', teamId: 'UNC' },
      { rank: 2, stars: 4, pos: 'PG', name: 'Bo Best', playerId: 'p00002', rating: 90, consensus: 95.1, school: 'Duke', teamId: 'DUK' },
    ]);
    expect(c.portal).toEqual([
      { rank: 1, pos: 'SF', name: 'Cy Mover', playerId: 'p00003', rating: 85, fromSchool: 'North Carolina', fromTeamId: 'UNC', toSchool: 'Duke', toTeamId: 'DUK' },
    ]);
  });
  it('skips classes already in the history, unlocked boards, boards with no class yet and seasons not played yet', () => {
    expect(liveRecruitingClasses([board(77)], teams, players, { have: have(78), before: 80 })).toEqual([]);
    expect(liveRecruitingClasses([board(78)], teams, players, { have: have(78, 79), before: 80 })).toEqual([]);
    expect(liveRecruitingClasses([board(78, { locked: false })], teams, players, { have: have(), before: 80 })).toEqual([]);
    expect(liveRecruitingClasses([board(78, { created: false, recruits: [], classDraft: [] })], teams, players, { have: have(), before: 80 })).toEqual([]);
    expect(liveRecruitingClasses([board(79)], teams, players, { have: have(78), before: 80 })).toEqual([]);
  });
  it('lists several classes oldest first and keeps an uncommitted recruit without a school', () => {
    const open = board(79, { recruits: [prospect('p00001', 94, 98.8, null)], portal: [] });
    const out = liveRecruitingClasses([open, board(78)], teams, players, { have: have(78), before: 81 });
    expect(out.map(c => c.season)).toEqual([79, 80]);
    expect(out[1].recruits[0]).toMatchObject({ school: null, teamId: null });
  });
});

describe('archiveRecruitingClass', () => {
  const history = { league: 'fbajc' as const, throughSeason: 78, classes: [{ season: 78, recruits: [], portal: [] }] };
  it("adds the board's class to the history, keeping the imported ones", () => {
    const out = archiveRecruitingClass(history, board(78), teams, players)!;
    expect(out.classes.map(c => c.season)).toEqual([78, 79]);
    expect(out.classes[1].recruits[0].name).toBe('Ann Ace');
    expect(out.throughSeason).toBe(78);
  });
  it('creates the history when there is none', () => {
    expect(archiveRecruitingClass(null, board(78), teams, players)!.classes.map(c => c.season)).toEqual([79]);
  });
  it('does nothing when the class is already there, the board is unlocked or has no class', () => {
    expect(archiveRecruitingClass({ ...history, classes: [{ season: 79, recruits: [], portal: [] }] }, board(78), teams, players)).toBeNull();
    expect(archiveRecruitingClass(history, board(78, { locked: false }), teams, players)).toBeNull();
    expect(archiveRecruitingClass(history, board(78, { created: false, recruits: [], classDraft: [] }), teams, players)).toBeNull();
    expect(archiveRecruitingClass(history, null, teams, players)).toBeNull();
  });
});
