import { shuffle, type Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import type { AllStarFile, DiceRoll, RollOff, TeamGame } from '../shared/types';
import { allStarFail, type AllStarResult, type FbaPlayer } from './common';
import { roll, rollOff, total } from './dice';

export const YSG_PICKS = 20;

export function startYsgDraft(doc: AllStarFile, rng: Rng): AllStarResult {
  if (!doc.selections) return allStarFail(['Save the selections first']);
  if (doc.ysgDraft) return allStarFail(['The Young-Star draft has already started']);
  return { ok: true, doc: { ...doc, ysgDraft: { order: shuffle([0, 1, 2, 3], rng), picks: [] } }, label: 'Start Young-Star draft' };
}

/** Snake draft: even rounds follow `order`, odd rounds reverse it. */
export function ysgTeamOf(order: number[], k: number): number {
  const round = Math.floor(k / 4);
  const pos = k % 4;
  return round % 2 === 0 ? order[pos] : order[3 - pos];
}

export function ysgOnClock(doc: AllStarFile): number | null {
  const d = doc.ysgDraft;
  if (!d || d.picks.length >= YSG_PICKS) return null;
  return ysgTeamOf(d.order, d.picks.length);
}

export function ysgTeams(doc: AllStarFile): string[][] {
  const teams: string[][] = [[], [], [], []];
  const d = doc.ysgDraft;
  d?.picks.forEach((id, k) => teams[ysgTeamOf(d.order, k)].push(id));
  return teams;
}

/** Young-Stars not yet picked; limited to positions the team lacks when any such player is left. */
export function ysgAvailable(doc: AllStarFile, list: FbaPlayer[]): FbaPlayer[] {
  const team = ysgOnClock(doc);
  if (team === null || !doc.selections || !doc.ysgDraft) return [];
  const taken = new Set(doc.ysgDraft.picks);
  const left = doc.selections.youngStars.filter(id => !taken.has(id)).map(id => list.find(p => p.playerId === id)!).filter(Boolean);
  const have = new Set(ysgTeams(doc)[team].map(id => list.find(p => p.playerId === id)?.position));
  const lacking = POSITIONS.filter(p => !have.has(p));
  const fits = left.filter(p => lacking.includes(p.position));
  return (fits.length ? fits : left).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}

export function ysgPick(doc: AllStarFile, playerId: string, list: FbaPlayer[]): AllStarResult {
  if (ysgOnClock(doc) === null) return allStarFail(['The Young-Star draft is not open']);
  if (!ysgAvailable(doc, list).some(p => p.playerId === playerId)) {
    return allStarFail(["That player can't be picked now (already taken, not a Young-Star, or the team still lacks another position)"]);
  }
  const d = doc.ysgDraft!;
  return { ok: true, doc: { ...doc, ysgDraft: { ...d, picks: [...d.picks, playerId] } }, label: `Young-Star draft pick ${d.picks.length + 1}` };
}

/** A dice game: each period, every player on each side rolls `rollsPerPeriod` times; a tie goes to a team roll-off. */
export function teamGame(teams: [number, number], members: string[][], periods: number, rollsPerPeriod: number, rng: Rng): TeamGame {
  const rolls: DiceRoll[][] = [];
  const scores: [number, number] = [0, 0];
  for (let p = 0; p < periods; p++) {
    const period: DiceRoll[] = [];
    teams.forEach((team, side) => {
      for (const playerId of members[team]) {
        for (let r = 0; r < rollsPerPeriod; r++) {
          const dice = roll(rng);
          period.push({ team, playerId, dice });
          scores[side] += total(dice);
        }
      }
    });
    rolls.push(period);
  }
  if (scores[0] !== scores[1]) return { teams, rolls, scores, rollOff: null, winner: scores[0] > scores[1] ? teams[0] : teams[1] };
  const r = rollOff([String(teams[0]), String(teams[1])], rng);
  return { teams, rolls, scores, rollOff: r.rollOff, winner: Number(r.order[0]) };
}

/** Young-Star MVP: the champion-team player with the most dice points across both semis and the final; a tie goes to a roll-off. */
export function ysgMvp(ysg: { semis: TeamGame[]; final: TeamGame; champion: number }, rng: Rng): { mvp: string; mvpRollOff: RollOff | null } {
  const points = new Map<string, number>();
  for (const g of [ysg.semis[0], ysg.semis[1], ysg.final]) {
    for (const period of g.rolls) {
      for (const r of period) {
        if (r.team === ysg.champion) points.set(r.playerId, (points.get(r.playerId) ?? 0) + total(r.dice));
      }
    }
  }
  const best = Math.max(...points.values());
  const tied = [...points.entries()].filter(([, v]) => v === best).map(([id]) => id);
  if (tied.length === 1) return { mvp: tied[0], mvpRollOff: null };
  const r = rollOff(tied, rng);
  return { mvp: r.order[0], mvpRollOff: r.rollOff };
}

export function runYoungStar(doc: AllStarFile, rng: Rng): AllStarResult {
  if (!doc.ysgDraft || doc.ysgDraft.picks.length < YSG_PICKS) return allStarFail(['Finish the Young-Star draft first']);
  if (doc.ysg) return allStarFail(['The Young-Star tournament has already been played']);
  const members = ysgTeams(doc);
  const [a, b, c, d] = shuffle([0, 1, 2, 3], rng);
  const semis = [teamGame([a, b], members, 2, 2, rng), teamGame([c, d], members, 2, 2, rng)];
  const final = teamGame([semis[0].winner, semis[1].winner], members, 2, 2, rng);
  const ysg = { semis, final, champion: final.winner };
  return { ok: true, doc: { ...doc, ysg: { ...ysg, ...ysgMvp(ysg, rng) } }, label: 'Run the Young-Star tournament' };
}
