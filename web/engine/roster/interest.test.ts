import { describe, expect, it } from 'vitest';
import { interestedTeams } from './interest';
import { baseState } from './testFixtures';

describe('interestedTeams', () => {
  it('lists teams with nobody at his position and cap room, flagging the ones that cannot meet the typical ask', () => {
    // p00030 is a 68 C: the typical ask is about $3. BOS has no room; CAR needs a C but has only $2 left; MON holds a better C.
    expect(interestedTeams(baseState(), 'p00030')).toEqual([
      { teamId: 'CAR', reason: 'need', holder: null, room: 2, ask: 3, affordable: false },
    ]);
  });
  it('lists a team whose player at his position is clearly worse, but only when the ask fits', () => {
    const s = baseState();
    s.fba.teams.MON = s.fba.teams.MON.map(e => (e.playerId === 'p00011' ? { ...e, rating: 60 } : e));
    // (BOS's SF contract has ended, so BOS needs one too, but its $2 of room is short of the ask, so it comes last.)
    const r = interestedTeams(s, 'p00032');
    expect(r.map(x => [x.teamId, x.reason])).toEqual([['MON', 'upgrade'], ['BOS', 'need']]);
    expect(r[0]).toMatchObject({ teamId: 'MON', reason: 'upgrade', room: 19, affordable: true, holder: { playerId: 'p00011', rating: 60 } });
    // Only a small gap: not interested.
    s.fba.teams.MON = s.fba.teams.MON.map(e => (e.playerId === 'p00011' ? { ...e, rating: 66 } : e));
    expect(interestedTeams(s, 'p00032').map(x => x.teamId)).toEqual(['BOS']);
  });
  it('puts the team he is leaving first, and treats an unrated D2 player as needing only the $1 minimum', () => {
    const s = baseState();
    // MON's PG p00010 has an ended, non-rookie contract.
    s.fba.teams.MON = s.fba.teams.MON.map(e => (e.playerId === 'p00010' ? { ...e, contractEnd: 78, restricted: false } : e));
    const own = interestedTeams(s, 'p00010');
    expect(own[0]).toMatchObject({ teamId: 'MON', reason: 'resign' });
    const d2 = interestedTeams(s, 'p00020');
    expect(d2.every(r => r.ask === null)).toBe(true);
    expect(d2.map(r => r.teamId)).toContain('MON');
  });
  it('is empty for someone who is not on the market', () => {
    expect(interestedTeams(baseState(), 'p00001')).toEqual([]);
  });
});
