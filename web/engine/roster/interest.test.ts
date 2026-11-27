import { describe, expect, it } from 'vitest';
import type { Region } from '../shared/regions';
import { interestedTeams, MAX_FILLED, WEIGHTS } from './interest';
import { playerProfile } from './interestProfile';
import { baseState } from './testFixtures';

// baseState (S79): by average rating CAR is the strongest team (strength 1), then BOS, then MON.
describe('interestedTeams', () => {
  it('lists teams with nobody at his position and cap room, flagging the ones that cannot meet the typical ask', () => {
    // p00030 is a 68 C: the typical ask is about $3. BOS has no room; CAR needs a C but has only $2 left; MON holds a better C.
    const r = interestedTeams(baseState(), 'p00030');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ teamId: 'CAR', strength: 1, reason: 'need', holder: null, room: 2, ask: 3, affordable: false });
    // strongest team 40, four players under contract 20; no college, history or own team here.
    expect(r[0].score).toEqual({ strength: 40, filled: 20, region: 0, history: 0, ownTeam: 0, total: 60 });
  });

  it('lists a team with a need even when it has no cap room, flagged as not affordable', () => {
    const s = baseState();
    // BOS (no cap room) has nobody at C: it still needs him, but would have to clear space.
    s.fba.teams.BOS = s.fba.teams.BOS.map(e => (e.position === 'C' ? { ...e, playerId: null, rating: null, age: null, contractEnd: null, contractAmount: null } : e));
    s.fba.teams.BOS = s.fba.teams.BOS.map(e => (e.position === 'PG' ? { ...e, contractEnd: 85, contractAmount: 25 } : e));
    const bos = interestedTeams(s, 'p00030').find(r => r.teamId === 'BOS')!;
    expect(bos).toMatchObject({ reason: 'need', affordable: false });
    expect(bos.room).toBeLessThan(1);
    expect(bos.maxOffer).toBe(0);
  });

  it('keeps $1 for each other open spot, so a team with room for his ask but two open spots is not affordable', () => {
    const s = baseState();
    // CAR has $2 left and needs a C (its only open spot): the ask of about $3 is out of reach either way. Give it a second open spot: the reserve is $1.
    s.fba.teams.CAR = s.fba.teams.CAR.map(e => (e.position === 'PG' ? { ...e, playerId: null, rating: null, age: null, contractEnd: null, contractAmount: null } : e));
    const car = interestedTeams(s, 'p00030').find(r => r.teamId === 'CAR')!;
    expect(car.reserve).toBe(1);
    expect(car.maxOffer).toBe(Math.max(0, Math.min(8, car.room - 1)));
    expect(car.affordable).toBe(car.room >= (car.ask ?? 1) + 1);
  });

  it('lists a team whose player at his position is clearly worse, but only when the ask fits', () => {
    const s = baseState();
    s.fba.teams.MON = s.fba.teams.MON.map(e => (e.playerId === 'p00011' ? { ...e, rating: 60 } : e));
    // (BOS's SF contract has ended, so BOS needs one too; it is the stronger team, so it ranks first.)
    const r = interestedTeams(s, 'p00032');
    expect(r.map(x => [x.teamId, x.reason])).toEqual([['BOS', 'need'], ['MON', 'upgrade']]);
    expect(r[1]).toMatchObject({ teamId: 'MON', reason: 'upgrade', room: 19, affordable: true, holder: { playerId: 'p00011', rating: 60 } });
    // Only a small gap: not interested.
    s.fba.teams.MON = s.fba.teams.MON.map(e => (e.playerId === 'p00011' ? { ...e, rating: 66 } : e));
    expect(interestedTeams(s, 'p00032').map(x => x.teamId)).toEqual(['BOS']);
  });

  it('puts his own team in the list with the boost, and treats an unrated D2 player as needing only the $1 minimum', () => {
    const s = baseState();
    // MON's PG p00010 has an ended, non-rookie contract.
    s.fba.teams.MON = s.fba.teams.MON.map(e => (e.playerId === 'p00010' ? { ...e, contractEnd: 78, restricted: false } : e));
    const own = interestedTeams(s, 'p00010');
    expect(own.find(x => x.teamId === 'MON')).toMatchObject({ reason: 'resign', score: { ownTeam: WEIGHTS.ownTeam } });
    const d2 = interestedTeams(s, 'p00020');
    expect(d2.every(r => r.ask === null)).toBe(true);
    expect(d2.map(r => r.teamId)).toContain('MON');
  });

  it('ranks by the score, not by strength alone, so a strong team with one player does not lead', () => {
    const s = baseState();
    // CAR has just one player under contract; BOS and MON are fuller. All three need a C.
    s.fba.teams.CAR = s.fba.teams.CAR.map((e, i) => (i === 0 ? e : { ...e, playerId: null, rating: null, age: null, contractEnd: null, contractAmount: null }));
    s.fba.teams.BOS = s.fba.teams.BOS.map(e => (e.position === 'C' ? { ...e, playerId: null, rating: null, age: null, contractEnd: null, contractAmount: null } : e));
    s.fba.teams.MON = s.fba.teams.MON.map(e => (e.position === 'C' ? { ...e, playerId: null, rating: null, age: null, contractEnd: null, contractAmount: null } : e));
    // Cap room for everyone: make the contracts small.
    for (const t of ['BOS', 'MON']) s.fba.teams[t] = s.fba.teams[t].map(e => (e.contractAmount ? { ...e, contractAmount: 1 } : e));
    const r = interestedTeams(s, 'p00030');
    const car = r.find(x => x.teamId === 'CAR')!;
    expect(car.score.filled).toBe(5); // one player: 5 points, not the full 20
    expect(r.map(x => x.score.total)).toEqual([...r.map(x => x.score.total)].sort((a, b) => b - a));
    expect(MAX_FILLED).toBe(4);
  });

  describe('region and history', () => {
    const regions = new Map<string, Region>([['CAR', 'Pacific'], ['BOS', 'New England'], ['MON', 'Southwest']]);
    const profile = (college: Region | null, seasons: [string, number][] = []) => ({ collegeRegion: college, seasonsWith: new Map(seasons) });
    const state = () => {
      const s = baseState();
      // Everyone needs a C and has room.
      for (const t of ['BOS', 'CAR', 'MON']) s.fba.teams[t] = s.fba.teams[t].map(e => (e.position === 'C' ? { ...e, playerId: null, rating: null, age: null, contractEnd: null, contractAmount: null } : { ...e, contractAmount: e.contractAmount ? 1 : e.contractAmount }));
      return s;
    };
    it('gives the full region points for the same region, a third for a neighbour, none otherwise', () => {
      const r = interestedTeams(state(), 'p00030', { profile: profile('Pacific'), teamRegions: regions });
      const by = (id: string) => r.find(x => x.teamId === id)!.score.region;
      expect(by('CAR')).toBe(WEIGHTS.region);
      expect(by('MON')).toBe(WEIGHTS.region / 3);
      expect(by('BOS')).toBe(0);
    });
    it('gives no region points when his college is unknown', () => {
      const r = interestedTeams(state(), 'p00030', { profile: profile(null), teamRegions: regions });
      expect(r.every(x => x.score.region === 0)).toBe(true);
    });
    it('credits at least one season with the team he is on now, even when his bio does not show it yet', () => {
      const s = state();
      s.fba.teams.MON = s.fba.teams.MON.map(e => (e.playerId === 'p00010' ? { ...e, contractEnd: 78, restricted: false } : e));
      const own = interestedTeams(s, 'p00010', { profile: profile(null, [['BOS', 3]]) }).find(x => x.teamId === 'MON')!;
      expect(own.reason).toBe('resign');
      expect(own.seasonsWith).toBe(1);
      expect(own.score.history).toBe(3);
    });
    it('grows with the seasons he played for a team and stops at five', () => {
      const r = interestedTeams(state(), 'p00030', { profile: profile(null, [['BOS', 2], ['MON', 9]]) });
      const hist = (id: string) => r.find(x => x.teamId === id)!;
      expect(hist('BOS').score.history).toBe(6);
      expect(hist('BOS').seasonsWith).toBe(2);
      expect(hist('MON').score.history).toBe(WEIGHTS.history);
      expect(hist('CAR').score.history).toBe(0);
    });
  });
});

describe('playerProfile', () => {
  const franchises = {
    league: 'fba' as const,
    franchises: [
      { teamId: 'DCB', eras: [{ name: 'Washington Wizards', abbr: 'DCB', city: 'Washington DC, USA', from: 1, to: null }] },
      { teamId: 'SAS', eras: [{ name: 'San Antonio Spirits', abbr: 'SAS', city: 'San Antonio, Texas', from: 1, to: null }] },
    ],
  };
  it('takes the last college and adds up the seasons with each FBA team', () => {
    const bio = { born: 'Born-S55', entries: ['Duke-S72-S74', 'Kentucky-S75', 'DCB-S76-S78', 'SAS-S79-pres.', 'DCB-S80'] };
    const p = playerProfile(bio, { season: 80, franchises });
    expect(p.collegeRegion).toBe('Southeast');
    expect(p.seasonsWith.get('DCB')).toBe(4);
    expect(p.seasonsWith.get('SAS')).toBe(1);
  });
  it('falls back to the school he was drafted from, and is empty without a bio', () => {
    expect(playerProfile(null, { season: 80, franchises, draftCollege: 'UCLA' }).collegeRegion).toBe('Pacific');
    expect(playerProfile(null, { season: 80, franchises }).seasonsWith.size).toBe(0);
  });
});
