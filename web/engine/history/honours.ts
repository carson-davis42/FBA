import { AWARD_LABEL } from '../awards/races';
import type { SummaryFile, SummaryPlayerLine } from '../shared/types';

export interface Honour { season: number; text: string }

/** A player's honours, season ascending; within a season: Finals MVP, awards, All-FBA, All-Star selections, then the weekend winners. */
export function playerHonours(seasons: SummaryFile[], playerId: string): Honour[] {
  const out: Honour[] = [];
  for (const s of [...seasons].sort((a, b) => a.season - b.season)) {
    const add = (text: string) => out.push({ season: s.season, text });
    if (s.champions.some(c => c.title === 'FBA Champion' && c.finalsMvp === playerId)) add('Finals MVP');
    for (const a of s.awards ?? []) if (a.playerId === playerId) add(AWARD_LABEL[a.award]);
    if (s.allFba) {
      ([['1', s.allFba.team1], ['2', s.allFba.team2]] as const).forEach(([n, team]) => {
        for (const slot of team) if (slot.playerId === playerId) add(`All-FBA Team ${n} (${slot.slot})`);
      });
    }
    const st = s.allStar;
    if (st) {
      if (st.allStars.includes(playerId)) add('All-Star');
      if (st.youngStars.includes(playerId)) add('Young-Star');
      if (st.asgMvp === playerId) add('All-Star Game MVP');
      if (st.ysgMvp === playerId) add('Young-Star MVP');
      if (st.fivePoint === playerId) add('5-point contest winner');
      if (st.dunk === playerId) add('Dunk contest winner');
    }
  }
  return out;
}

/** The player's season lines (team stints and season totals) in the summaries, in the order given. */
export function playerLines(seasons: SummaryFile[], playerId: string): { season: number; line: SummaryPlayerLine }[] {
  const out: { season: number; line: SummaryPlayerLine }[] = [];
  for (const s of seasons) for (const line of s.players ?? []) if (line.playerId === playerId) out.push({ season: s.season, line });
  return out;
}
