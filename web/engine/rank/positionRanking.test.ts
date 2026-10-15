import { describe, expect, it } from 'vitest'
import { RankingFile } from '../shared/types'
import {
  mergeHeads, mergeOptions, movePool, promoteTop, positionList, positionStepDone, positionUnranked, resetPositionStep, sendBackAtPosition, sendBackMerged, takeAtPosition, takeRestAtPosition,
  takeRestMerged,
} from './positionRanking'
import { rankName, rankingDoc } from './testFixtures'

// Ada PG 80 · Ben SG 85 · Cal PG 80 · Dev PG new (FBA 70) · Eli PG new · Finn C new (FBA 75)
const doc = (patch: Partial<RankingFile> = {}) => rankingDoc({ kind: 'college-class', league: 'fbajc', byPosition: {}, ...patch })
const ids = (rows: { playerId: string }[]) => rows.map(r => r.playerId)

describe('position step', () => {
  it('lists the unranked players of a position in last-class order, and places them one at a time', () => {
    let d = doc()
    expect(ids(positionUnranked(d, rankName, 'PG'))).toEqual(['p00001', 'p00003', 'p00004', 'p00005'])
    d = takeAtPosition(d, 'p00003')
    d = takeAtPosition(d, 'p00001')
    expect(positionList(d, 'PG')).toEqual(['p00003', 'p00001'])
    expect(ids(positionUnranked(d, rankName, 'PG'))).toEqual(['p00004', 'p00005'])
    expect(takeAtPosition(d, 'p00003')).toBe(d)
    expect(positionStepDone(d)).toBe(false)
  })

  it('is done once every player is placed within his position', () => {
    const d = takeRestAtPosition(doc(), rankName)
    expect(positionStepDone(d)).toBe(true)
    expect(positionList(d, 'PG')).toEqual(['p00001', 'p00003', 'p00004', 'p00005'])
    expect(positionList(d, 'SG')).toEqual(['p00002'])
    expect(positionList(d, 'C')).toEqual(['p00006'])
  })

  it('sending a player back also removes those placed below him, and the step can restart', () => {
    let d = takeRestAtPosition(doc(), rankName, 'PG')
    d = sendBackAtPosition(d, 'p00003')
    expect(positionList(d, 'PG')).toEqual(['p00001'])
    expect(resetPositionStep(d).byPosition).toEqual({})
  })

  it('does nothing on a doc without the step, a locked doc, or once the whole ranking has begun', () => {
    const plain = rankingDoc()
    expect(takeAtPosition(plain, 'p00001')).toBe(plain)
    const begun = { ...takeRestAtPosition(doc(), rankName), order: ['p00001'] }
    expect(takeAtPosition(begun, 'p00001')).toBe(begun)
    expect(resetPositionStep(begun)).toBe(begun)
  })
})

describe('merging into the whole ranking', () => {
  const stepped = () => takeRestAtPosition(doc(), rankName)

  it('offers only the best remaining player at each position', () => {
    const d = stepped()
    expect([...mergeHeads(d)].sort()).toEqual(['p00001', 'p00002', 'p00006'])
    expect([...mergeHeads({ ...d, order: ['p00001'] })].sort()).toEqual(['p00002', 'p00003', 'p00006'])
  })

  it('takes the rest by last-class order among the heads, and never ranks a position out of its own order', () => {
    const d = takeRestMerged({ ...stepped(), order: ['p00006'] }, rankName)
    // Ben (SG 85) first, then Ada, Cal (80), then the new PGs Dev, Eli; Finn was already placed.
    expect(d.order).toEqual(['p00006', 'p00002', 'p00001', 'p00003', 'p00004', 'p00005'])
    expect(d.order.filter(id => ['p00001', 'p00003', 'p00004', 'p00005'].includes(id))).toEqual(positionList(d, 'PG'))
  })

  it('lists the heads in PG, SG, SF, PF, C order, however the rows are ordered', () => {
    const d = stepped()
    expect(mergeOptions(d).map(r => r.position)).toEqual(['PG', 'SG', 'C'])
    // New rows listed with the center first and a point guard last: still PG first.
    const shuffled = { ...d, rows: [...d.rows].reverse() }
    expect(mergeOptions(shuffled).map(r => r.position)).toEqual(['PG', 'SG', 'C'])
    expect(mergeOptions({ ...d, order: ['p00001', 'p00003', 'p00004', 'p00005'] }).map(r => r.position)).toEqual(['SG', 'C'])
  })

  it('takes the rest by rating among the heads, equal ratings in PG, SG, SF, PF, C order', () => {
    const rows = ([['p00001', 'C'], ['p00002', 'PF'], ['p00003', 'SF'], ['p00004', 'SG'], ['p00005', 'PG']] as const).map(([playerId, position]) => (
      { playerId, position, age: null, team: null, prevRating: null, otherRating: null, stat: null }))
    const d = takeRestAtPosition(rankingDoc({ kind: 'college-class', league: 'fbajc', byPosition: {}, rows }), rankName)
    expect(takeRestMerged(d, rankName).order).toEqual(['p00005', 'p00004', 'p00003', 'p00002', 'p00001'])
  })

  it('does not merge before the position step is done', () => {
    const d = doc()
    expect(takeRestMerged(d, rankName)).toBe(d)
  })

  it('sending a ranked player back also sends back the ones of his position ranked below him', () => {
    const d = { ...stepped(), order: ['p00001', 'p00002', 'p00003', 'p00004'] }
    const back = sendBackMerged(d, 'p00003')
    expect(back.order).toEqual(['p00001', 'p00002'])
    expect(sendBackMerged(d, 'p00002').order).toEqual(['p00001', 'p00003', 'p00004'])
  })
})

describe('the pool of five', () => {
  const stepped = () => takeRestAtPosition(doc(), rankName)
  const ids = (d: Parameters<typeof mergeOptions>[0]) => mergeOptions(d).map(r => r.playerId)

  it('holds the players on offer in the order they are moved to, and the top one joins the ranking', () => {
    let d = stepped()
    expect(ids(d)).toEqual(['p00001', 'p00002', 'p00006'])
    d = movePool(d, 'p00006', -1)
    d = movePool(d, 'p00006', -1)
    expect(ids(d)).toEqual(['p00006', 'p00001', 'p00002'])
    expect(movePool(d, 'p00006', -1)).toBe(d)
    d = promoteTop(d)
    expect(d.order).toEqual(['p00006'])
    // Finn is in; the pool keeps Ada and Ben in their order. Nobody else joins (Finn was the only C).
    expect(ids(d)).toEqual(['p00001', 'p00002'])
  })

  it('a new player joins the pool at the bottom, in position order when several join', () => {
    let d = stepped()
    d = promoteTop(d) // Ada (PG) joins; Cal (PG) is next at PG
    expect(d.order).toEqual(['p00001'])
    expect(ids(d)).toEqual(['p00002', 'p00006', 'p00003'])
    d = movePool(d, 'p00003', -1)
    expect(ids(d)).toEqual(['p00002', 'p00003', 'p00006'])
    d = promoteTop(d)
    expect(d.order).toEqual(['p00001', 'p00002'])
    // Ben was the only SG, so nobody joins in his place.
    expect(ids(d)).toEqual(['p00003', 'p00006'])
  })

  it('runs to the end: every player ranked, each position in its own order', () => {
    let d = stepped()
    while (mergeOptions(d).length > 0) d = promoteTop(d)
    expect(d.order).toHaveLength(6)
    expect(d.order.filter(id => positionList(d, 'PG').includes(id))).toEqual(positionList(d, 'PG'))
  })

  it('does nothing before the position step is done or on a locked doc', () => {
    const d = doc()
    expect(promoteTop(d)).toBe(d)
    const locked = { ...stepped(), locked: true }
    expect(promoteTop(locked)).toBe(locked)
    expect(movePool(locked, 'p00001', 1)).toBe(locked)
  })

  it('the schema accepts a pool of known players and rejects strangers or repeats', () => {
    expect(RankingFile.safeParse({ ...stepped(), pool: ['p00006', 'p00001'] }).success).toBe(true)
    expect(RankingFile.safeParse({ ...stepped(), pool: ['p09999'] }).success).toBe(false)
    expect(RankingFile.safeParse({ ...stepped(), pool: ['p00001', 'p00001'] }).success).toBe(false)
  })
})

describe('schema', () => {
  const base = () => takeRestAtPosition(doc(), rankName)
  it('accepts a consistent doc and the old shape without byPosition', () => {
    expect(RankingFile.safeParse({ ...base(), order: ['p00006', 'p00001', 'p00003'] }).success).toBe(true)
    expect(RankingFile.safeParse(doc({ byPosition: undefined })).success).toBe(true)
  })
  it('rejects a whole ranking that contradicts a position ranking, or a player at the wrong position', () => {
    expect(RankingFile.safeParse({ ...base(), order: ['p00003', 'p00001'] }).success).toBe(false)
    expect(RankingFile.safeParse({ ...base(), byPosition: { SG: ['p00001'] } }).success).toBe(false)
  })
  it('only a class ranking has position rankings', () => {
    expect(RankingFile.safeParse({ ...base(), kind: 'd2-reset', league: 'fbad2' }).success).toBe(false)
  })
})
