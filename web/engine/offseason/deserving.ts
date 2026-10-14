import { awardTotalsAll, liveCareer, type Career } from '../history/career'
import type { AwardCountsFile, AwardKey, HallOfFameFile, PlayerBio, SummaryFile } from '../shared/types'
import type { Candidate } from './hallOfFame'

/** Points per honour a player earned for himself. Bigger prizes weigh more; the exact weights are a judgement call. */
export const PERSONAL_POINTS: Partial<Record<AwardKey, number>> = {
  MVP: 10, FINALS_MVP: 8, DPOY: 6, PPK: 5, LP: 5, MC: 5, ALL_FBA_1: 5, ALL_FBA_2: 3, ROTY: 3, MIP: 2, ALL_STAR: 2, ASG_MVP: 2,
  YOUNG_STAR: 1, YSG_MVP: 1, FIVE_POINT: 1, DUNK: 1,
}
/** Points per honour that belongs to the team he was on. */
export const TEAM_POINTS: Partial<Record<AwardKey, number>> = { CHAMPION: 5, CONF_CHAMPION: 2, CSHIP_APP: 2 }

export interface Deserving { personal: number; team: number; seasons: number }

/** Seasons spent in the FBA by the career's FBA stints (a "pres." stint counts to the retirement season). */
export function fbaSeasons(career: Career, retiredSeason: number): number {
  let n = 0
  for (const s of career.stints) {
    if (s.kind !== 'fba') continue
    const ranges = s.range.split(';').map(r => r.trim())
    for (const r of ranges) {
      const m = /^(?:S(\d+)|FFL)(?:\s*-\s*(?:S(\d+)|pres\.))?$/.exec(r)
      if (!m || m[1] === undefined) continue
      const from = Number(m[1])
      const to = /-\s*pres\./.test(r) ? retiredSeason : m[2] !== undefined ? Number(m[2]) : from
      if (to >= from) n += to - from + 1
    }
  }
  return n
}

export function deserving(totals: Partial<Record<AwardKey, number>>, career: Career, retiredSeason: number): Deserving {
  const sum = (points: Partial<Record<AwardKey, number>>) => Object.entries(points).reduce((t, [k, p]) => t + (totals[k as AwardKey] ?? 0) * (p ?? 0), 0)
  return { personal: sum(PERSONAL_POINTS), team: sum(TEAM_POINTS), seasons: fbaSeasons(career, retiredSeason) }
}

export interface RankedCandidate { candidate: Candidate; score: Deserving }

/**
 * Candidates from most to least deserving: personal awards first, then team awards, then seasons in the FBA. Equal on all three keeps the
 * order they came in (newest retirement first, then name).
 */
export function rankCandidates(
  list: Candidate[], baseline: AwardCountsFile | null, summaries: SummaryFile[], bioOf: (playerId: string) => PlayerBio | null, hof: HallOfFameFile | null,
): RankedCandidate[] {
  const totals = awardTotalsAll(baseline, summaries)
  const ranked = list.map(candidate => ({
    candidate,
    score: deserving(totals.get(candidate.playerId) ?? {}, liveCareer(bioOf(candidate.playerId), candidate.playerId, summaries, hof), candidate.retired.season),
  }))
  return ranked
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.score.personal - a.r.score.personal || b.r.score.team - a.r.score.team || b.r.score.seasons - a.r.score.seasons || a.i - b.i)
    .map(x => x.r)
}
