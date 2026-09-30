import { careerLines, liveCareer } from '../history/career';
import { appendTx, type MoveContext } from '../roster/state';
import { calendarProblem, type WritesResult } from '../season/moves';
import { markStepDone } from '../shared/calendar';
import type { CalendarFile, HallOfFameFile, HofCard, PlayerBio, PlayersFile, RetiredInfo, SummaryFile, TransactionsFile } from '../shared/types';

/** D17: the nominee list never holds more than this. */
export const NOMINEE_CAP = 15;
/** Inductees per class. */
export const CLASS_SIZE = 3;
export const HOF_PATH = 'leagues/fba/hallOfFame.json';
export const HOF_STEP = 'hall-of-fame-induction';

export interface HofState { season: number; calendar: CalendarFile; hof: HallOfFameFile; players: PlayersFile; tx: TransactionsFile; summaries: SummaryFile[] }
export interface Candidate { playerId: string; name: string; retired: RetiredInfo }

type NameRef = { name: string; playerId: string | null };

const same = (a: NameRef, b: NameRef): boolean =>
  a.playerId !== null && a.playerId === b.playerId
  || (a.playerId === null || b.playerId === null) && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

const known = (hof: HallOfFameFile): NameRef[] => [...hof.nominees, ...hof.classes.flatMap(c => c.inductees), ...hof.removed];
const hofWrite = (hof: HallOfFameFile, label: string): WritesResult => ({ ok: true, label, writes: [{ path: HOF_PATH, doc: hof }] });

/** Named retirees who aren't a nominee, an inductee or removed, newest retirement first, then by name. */
export function candidates(hof: HallOfFameFile, players: PlayersFile): Candidate[] {
  const taken = known(hof);
  const out: Candidate[] = [];
  for (const p of Object.values(players.players)) {
    if (!p.retired || p.name === null || taken.some(k => same(k, { name: p.name!, playerId: p.id }))) continue;
    out.push({ playerId: p.id, name: p.name, retired: p.retired });
  }
  return out.sort((a, b) => b.retired.season - a.retired.season || a.name.localeCompare(b.name));
}

/**
 * A card for a retiree: their full career lines (the imported bio plus the seasons played in the app, as in the History
 * Hall of Fame). With no career on record it falls back to the last team as "TEAM: …-S79", the start left for the
 * commissioner to fill in. A retiree with no bio also gets an "S<n> <award>" line per S1-S78 summary award.
 */
export function prefillCard(c: Candidate, summaries: SummaryFile[], bio: PlayerBio | null, hof: HallOfFameFile | null): HofCard {
  const { retired } = c;
  const team = retired.league === 'fba' ? retired.teamId ?? '?' : `D2 ${retired.teamId ?? 'Reserves'}`;
  const lines = careerLines(liveCareer(bio, c.playerId, summaries, hof));
  if (lines.length === 0) lines.push(`${team}: …-S${retired.season}`);
  if (bio === null) {
    // No imported bio: the S1-S78 summaries give the awards, as the old prefill did (S79 on is already in the live career).
    for (const s of [...summaries].filter(x => x.league === 'fba' && x.season < 79).sort((a, b) => a.season - b.season)) {
      for (const a of s.awards ?? []) if (a.playerId === c.playerId) lines.push(`S${s.season} ${a.award}`);
      if (s.allFba?.team1.some(x => x.playerId === c.playerId)) lines.push(`S${s.season} All-FBA T1`);
      if (s.allFba?.team2.some(x => x.playerId === c.playerId)) lines.push(`S${s.season} All-FBA T2`);
    }
  }
  return { name: c.name, playerId: c.playerId, retiredSeason: `S${retired.season}`, lines };
}

/** A nominee the app doesn't know. */
export const freeNameCard = (name: string, retiredSeason: string): HofCard => ({ name: name.trim(), playerId: null, retiredSeason: retiredSeason.trim(), lines: [] });

export function addNominees(hof: HallOfFameFile, cards: HofCard[]): WritesResult {
  if (hof.nominees.length + cards.length > NOMINEE_CAP) return { ok: false, problems: [`The nominee list is capped at ${NOMINEE_CAP}: remove someone first`] };
  const taken = known(hof);
  for (const card of cards) {
    if (taken.some(k => same(k, card))) return { ok: false, problems: [`${card.name} is already on the list, in the Hall, or was removed`] };
    taken.push(card);
  }
  return hofWrite({ ...hof, nominees: [...hof.nominees, ...cards] }, 'Add Hall of Fame nominees');
}

const noNominee = (hof: HallOfFameFile, index: number): string | null =>
  Number.isInteger(index) && index >= 0 && index < hof.nominees.length ? null : 'That nominee is not on the list';

export function editNominee(hof: HallOfFameFile, index: number, patch: Partial<Pick<HofCard, 'name' | 'retiredSeason' | 'lines'>>): WritesResult {
  const bad = noNominee(hof, index);
  if (bad) return { ok: false, problems: [bad] };
  const old = hof.nominees[index];
  const next: HofCard = {
    ...old,
    name: (patch.name ?? old.name).trim(),
    retiredSeason: (patch.retiredSeason ?? old.retiredSeason).trim(),
    lines: (patch.lines ?? old.lines).map(l => l.trim()).filter(l => l !== ''),
  };
  if (next.name === '') return { ok: false, problems: ['A nominee needs a name'] };
  if (next.retiredSeason === '') return { ok: false, problems: ['A nominee needs a retirement season'] };
  return hofWrite({ ...hof, nominees: hof.nominees.map((n, i) => (i === index ? next : n)) }, 'Edit Hall of Fame nominee');
}

export function removeNominee(hof: HallOfFameFile, index: number): WritesResult {
  const bad = noNominee(hof, index);
  if (bad) return { ok: false, problems: [bad] };
  const gone = hof.nominees[index];
  return hofWrite(
    { ...hof, nominees: hof.nominees.filter((_, i) => i !== index), removed: [...hof.removed, { name: gone.name, playerId: gone.playerId }] },
    'Remove Hall of Fame nominee',
  );
}

/** Inducts exactly min(CLASS_SIZE, nominees) nominees as this season's class. Gated on the calendar step. */
export function induct(state: HofState, indexes: number[], ctx: MoveContext): WritesResult {
  const step = calendarProblem(state.calendar, HOF_STEP, 'The Hall of Fame class is inducted');
  if (step) return { ok: false, problems: [step] };
  const season = `S${state.season}`;
  const { hof } = state;
  if (hof.classes.some(c => c.season === season)) return { ok: false, problems: [`The ${season} class has already been inducted`] };
  if (hof.nominees.length === 0) return { ok: false, problems: ['There are no nominees'] };
  const need = Math.min(CLASS_SIZE, hof.nominees.length);
  const distinct = [...new Set(indexes)];
  if (distinct.length !== indexes.length || distinct.length !== need || distinct.some(i => noNominee(hof, i))) {
    return { ok: false, problems: [`Pick exactly ${need} ${need === 1 ? 'nominee' : 'nominees'}`] };
  }
  const chosen = new Set(distinct);
  const inductees = hof.nominees.filter((_, i) => chosen.has(i));
  const doc: HallOfFameFile = {
    ...hof,
    classes: [...hof.classes, { season, inductees }],
    nominees: hof.nominees.filter((_, i) => !chosen.has(i)),
  };
  const tx = appendTx(state.tx, ctx, 'hall-of-fame', [], [`${season} Hall of Fame class: ${inductees.map(i => i.name).join(', ')}`]);
  return {
    ok: true,
    label: `${season} Hall of Fame class`,
    writes: [
      { path: HOF_PATH, doc },
      { path: `leagues/fba/${season}/transactions.json`, doc: tx },
      { path: 'calendar.json', doc: markStepDone(state.calendar, HOF_STEP) },
    ],
  };
}
