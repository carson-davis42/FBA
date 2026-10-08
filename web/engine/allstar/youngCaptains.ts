import { shuffle, type Rng } from '../d2/random';
import type { HallOfFameFile, PlayersFile, SummaryFile } from '../shared/types';

/** Who may captain a Young-Star team: the latest Hall of Fame class, then anyone who captained a past Young-Star champion. */
export interface CaptainRules {
  /** The latest Hall of Fame class's players (in the registry). All of them captain. */
  hofClass: string[];
  /** Past Young-Star champion captains, most recent first. */
  champions: string[];
}

/** One registry player per lower-cased name; a name two players share is left out. */
function uniqueNames(players: PlayersFile): Map<string, string> {
  const seen = new Map<string, string[]>();
  for (const p of Object.values(players.players)) {
    if (p.name === null) continue;
    const key = p.name.trim().toLowerCase();
    seen.set(key, [...(seen.get(key) ?? []), p.id]);
  }
  return new Map([...seen].flatMap(([k, ids]) => (ids.length === 1 ? [[k, ids[0]] as [string, string]] : [])));
}

/** The last class in the file (classes run oldest first), as registry players; an inductee with no id is found by name. */
export function latestHofClass(hof: HallOfFameFile | null | undefined, players: PlayersFile): string[] {
  const last = hof?.classes[hof.classes.length - 1];
  const names = uniqueNames(players);
  return (last?.inductees ?? []).flatMap(i => {
    const id = i.playerId ?? names.get(i.name.trim().toLowerCase());
    return id && players.players[id] ? [id] : [];
  });
}

/**
 * The captains of past Young-Star champions, newest season first. A summary names the champion as "Team <captain>"; the
 * name is matched to the one registry player who has it (a name two players share is skipped).
 */
export function championCaptains(summaries: SummaryFile[], players: PlayersFile): string[] {
  const names = uniqueNames(players);
  const out: string[] = [];
  for (const s of [...summaries].filter(x => x.league === 'fba').sort((a, b) => b.season - a.season)) {
    const m = /^Team (.+)$/.exec(s.allStar?.ysgWinner ?? '');
    const id = m ? names.get(m[1].trim().toLowerCase()) : undefined;
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export const captainRules = (hof: HallOfFameFile | null | undefined, summaries: SummaryFile[], players: PlayersFile): CaptainRules =>
  ({ hofClass: latestHofClass(hof, players), champions: championCaptains(summaries, players) });

/** Players who can captain this year: the Hall of Fame class and the past champion captains, minus this year's Young-Stars. */
export const eligibleCaptains = (rules: CaptainRules, youngStars: string[]): string[] =>
  [...new Set([...rules.hofClass, ...rules.champions])].filter(id => !youngStars.includes(id));

/** `count` different past champion captains drawn at random, leaving out `exclude` and this year's Young-Stars. */
export function drawChampionCaptains(rules: CaptainRules, youngStars: string[], exclude: string[], count: number, rng: Rng): string[] {
  const pool = rules.champions.filter(id => !exclude.includes(id) && !youngStars.includes(id));
  return shuffle(pool, rng).slice(0, Math.max(0, count));
}

/** The four captains: the Hall of Fame class first, then past champion captains drawn at random. */
export function suggestYoungCaptains(rules: CaptainRules, youngStars: string[], rng: Rng): string[] {
  const hof = rules.hofClass.filter(id => !youngStars.includes(id)).slice(0, 4);
  return [...hof, ...drawChampionCaptains(rules, youngStars, hof, 4 - hof.length, rng)];
}

export function captainProblems(captains: string[], youngStars: string[], rules: CaptainRules): string[] {
  const out: string[] = [];
  const eligible = eligibleCaptains(rules, youngStars);
  if (captains.some(id => !eligible.includes(id))) out.push('Young-Star captains must be the latest Hall of Fame class or former Young-Star champion captains');
  if (rules.hofClass.some(id => !youngStars.includes(id) && !captains.includes(id))) out.push('Young-Star captains must include the latest Hall of Fame class');
  return out;
}
