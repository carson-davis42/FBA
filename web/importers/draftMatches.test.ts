import { describe, expect, it } from 'vitest';
import type { DraftHistoryFile, PlayersFile } from '../engine/shared/types';
import { DRAFT_MATCHES, matchDraftPicks, mergePlayerRecords, PLAYER_MERGES, replacePlayerId } from './draftMatches';

describe('replacePlayerId', () => {
  it('replaces the id wherever it is a value or a key, without touching other text', () => {
    const doc = { rows: [{ playerId: 'p2', note: 'p2 is not replaced inside text' }], ratings: { p2: 80, p3: 70 }, ids: ['p2', 'p9'] };
    const r = replacePlayerId(doc, 'p2', 'p1');
    expect(r.doc).toEqual({ rows: [{ playerId: 'p1', note: 'p2 is not replaced inside text' }], ratings: { p1: 80, p3: 70 }, ids: ['p1', 'p9'] });
    expect(r.changed).toBe(3);
    expect(doc.rows[0].playerId).toBe('p2');
  });
  it('reports nothing changed when the id is absent, and refuses when a key would collide', () => {
    expect(replacePlayerId({ a: 'p5' }, 'p2', 'p1')).toEqual({ doc: { a: 'p5' }, changed: 0 });
    expect(() => replacePlayerId({ ratings: { p1: 1, p2: 2 } }, 'p2', 'p1')).toThrow(/both/);
  });
});

describe('mergePlayerRecords', () => {
  const players: PlayersFile = { nextId: 9, players: {
    p1: { id: 'p1', name: "D'Andre Holiday", birthSeason: 56 },
    p2: { id: 'p2', name: "D'Andre Holliday", birthSeason: null, retired: true } as never,
  } };
  it('keeps one record under the given name, fills its empty fields from the other, and drops the other', () => {
    const out = mergePlayerRecords(players, 'p1', 'p2', "D'Andre Holliday");
    expect(Object.keys(out.players)).toEqual(['p1']);
    expect(out.players.p1).toMatchObject({ id: 'p1', name: "D'Andre Holliday", birthSeason: 56, retired: true });
  });
  it('does nothing when the dropped record is already gone', () => {
    const once = mergePlayerRecords(players, 'p1', 'p2', "D'Andre Holliday");
    expect(mergePlayerRecords(once, 'p1', 'p2', "D'Andre Holliday")).toEqual(once);
  });
});

describe('matchDraftPicks', () => {
  const draft: DraftHistoryFile = { drafts: [
    { season: 71, kind: 'draft', date: null, picks: [
      { pick: 4, teamId: 'SEA', teamName: 'Seattle', viaTeamId: null, name: 'Izayah Hillirad', playerId: null, pos: 'PG', detail: 'Senior', college: 'Clemson' },
      { pick: 5, teamId: 'X', teamName: 'X', viaTeamId: null, name: 'Someone', playerId: null, pos: 'PG', detail: 'Senior', college: 'Y' },
    ] },
  ] };
  it('sets the player id on a pick found by season, pick and sheet name', () => {
    const r = matchDraftPicks(draft, [{ season: 71, pick: 4, name: 'Izayah Hillirad', playerId: 'p00119' }]);
    expect(r.draft.drafts[0].picks[0].playerId).toBe('p00119');
    expect(r.draft.drafts[0].picks[1].playerId).toBeNull();
    expect(r.changed).toEqual(['S71 #4 Izayah Hillirad -> p00119']);
    expect(draft.drafts[0].picks[0].playerId).toBeNull();
  });
  it('skips a pick that already has its id or does not match', () => {
    const done = matchDraftPicks(draft, [{ season: 71, pick: 4, name: 'Izayah Hillirad', playerId: 'p00119' }]).draft;
    expect(matchDraftPicks(done, [{ season: 71, pick: 4, name: 'Izayah Hillirad', playerId: 'p00119' }]).changed).toEqual([]);
    expect(matchDraftPicks(draft, [{ season: 71, pick: 4, name: 'Somebody Else', playerId: 'p1' }]).changed).toEqual([]);
  });
});

describe('the recorded fixes', () => {
  it('lists the three misspelled picks and the two duplicate players', () => {
    expect(DRAFT_MATCHES.map(m => `${m.season}:${m.pick}:${m.playerId}`)).toEqual(['71:4:p00119', '73:24:p00371', '78:7:p00087']);
    expect(PLAYER_MERGES.map(m => `${m.keep}<-${m.drop}`)).toEqual(['p00065<-p02358', 'p00256<-p00461']);
  });
});
