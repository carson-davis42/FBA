import { describe, expect, it } from 'vitest'
import { RankingFile } from '../shared/types'
import {
  mergeHeads, positionList, positionStepDone, positionUnranked, resetPositionStep, sendBackAtPosition, sendBackMerged, takeAtPosition, takeRestAtPosition,
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
