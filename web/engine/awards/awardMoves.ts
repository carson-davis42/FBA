import { appendTx, type MoveContext } from '../roster/state';
import { leagueStepProblem } from '../season/moves';
import { PAUSE_LABEL, playerName, seasonFail, seasonOver, type SeasonResult, type SeasonState } from '../season/state';
import type { AllFbaSlot, AwardId, AwardsFile, RostersFile } from '../shared/types';
import { AWARD_LABEL, D2_AWARDS, FBA_AWARDS, races, SLOT_POSITIONS, suggestAllFba } from './races';

const LEAGUE_NAME = { fba: 'FBA', fbad2: 'D2' } as const;
const ORDER: AwardId[] = [...FBA_AWARDS, ...D2_AWARDS];
const SLOT_NEED: Record<AllFbaSlot['slot'], string> = { G: 'a guard (PG or SG)', F: 'a forward (SF or PF)', C: 'a C', ANY: 'a player' };

/** The awards are decided after the regular season and every pause, at the league's calendar step. */
function readyProblems(state: SeasonState): string[] {
  const out: string[] = [];
  const step = leagueStepProblem(state.calendar, state.league);
  if (step) out.push(step);
  if (!seasonOver(state)) out.push('Finish the regular season first');
  const open = state.schedule?.pauses.find(p => !p.done);
  if (open) out.push(`Finish the ${PAUSE_LABEL[open.kind]} pause (after game ${open.afterGame}) first`);
  return out;
}

/** Drafts awards.json with every race leader and (FBA) the suggested All-FBA teams. */
export function startAwards(state: SeasonState, lastSeason: RostersFile | null): SeasonResult {
  const problems = readyProblems(state);
  if (state.awards) problems.push('The awards have already been started');
  if (problems.length) return seasonFail(problems);
  const rs = races(state, lastSeason);
  const awards = rs.filter(r => r.rows.length).map(r => ({ award: r.award, playerId: r.rows[0].playerId, teamId: r.rows[0].teamId }));
  const allFba = state.league === 'fba' ? suggestAllFba(rs.find(r => r.award === 'MVP')!) : null;
  const doc: AwardsFile = { league: state.league, season: state.season, locked: false, awards, allFba };
  return { ok: true, state: { ...state, awards: doc }, changed: ['awards'], label: `Start S${state.season} ${LEAGUE_NAME[state.league]} awards` };
}

export function setAward(doc: AwardsFile, award: AwardId, playerId: string, teamId: string): AwardsFile {
  const awards = [...doc.awards.filter(a => a.award !== award), { award, playerId, teamId }]
    .sort((a, b) => ORDER.indexOf(a.award) - ORDER.indexOf(b.award));
  return { ...doc, awards };
}

export function setAllFbaSlot(doc: AwardsFile, team: 'team1' | 'team2', index: number, playerId: string, teamId: string): AwardsFile {
  if (!doc.allFba) return doc;
  return { ...doc, allFba: { ...doc.allFba, [team]: doc.allFba[team].map((s, i) => (i === index ? { ...s, playerId, teamId } : s)) } };
}

/** Everything that stops Lock awards: missing or ineligible winners, and incomplete or invalid All-FBA teams. */
export function awardProblems(state: SeasonState, lastSeason: RostersFile | null, doc: AwardsFile): string[] {
  const rs = races(state, lastSeason);
  const name = (id: string) => playerName(state, id);
  const out: string[] = [];
  for (const a of doc.awards) {
    const race = rs.find(r => r.award === a.award);
    if (!race) out.push(`${AWARD_LABEL[a.award]} isn't an award in this league; clear the pick`);
    else if (!race.rows.length) out.push(`${race.label} has no eligible players; clear the pick`);
  }
  for (const race of rs) {
    if (!race.rows.length) continue;
    const pick = doc.awards.find(a => a.award === race.award);
    if (!pick) out.push(`Pick a winner for ${race.label}`);
    else if (!race.rows.some(r => r.playerId === pick.playerId)) out.push(`${name(pick.playerId)} isn't eligible for ${race.label}`);
  }
  if (state.league === 'fba') {
    const mvp = rs.find(r => r.award === 'MVP')!;
    if (!doc.allFba) out.push('Fill in the All-FBA teams');
    else {
      const seen = new Map<string, 'team1' | 'team2'>();
      for (const [t, team] of (['team1', 'team2'] as const).entries()) {
        const label = `All-FBA team ${t + 1}`;
        for (const s of doc.allFba[team]) {
          if (!s.playerId) {
            out.push(`${label} needs a player in the ${s.slot} slot`);
            continue;
          }
          const r = mvp.rows.find(x => x.playerId === s.playerId);
          if (!r) out.push(`${name(s.playerId)} isn't eligible for All-FBA`);
          else if (!SLOT_POSITIONS[s.slot].includes(r.position)) out.push(`${label} needs ${SLOT_NEED[s.slot]} in the ${s.slot} slot`);
          const before = seen.get(s.playerId);
          if (before) out.push(before === team ? `${name(s.playerId)} is listed twice on ${label}` : `${name(s.playerId)} is on both All-FBA teams`);
          seen.set(s.playerId, team);
        }
      }
    }
  }
  return out;
}

/** Locks the draft, records each winner's team at lock time, and logs one 'awards' transaction. */
export function lockAwards(state: SeasonState, lastSeason: RostersFile | null, ctx: MoveContext): SeasonResult {
  const problems = readyProblems(state);
  const doc = state.awards;
  if (!doc) problems.push('Start the awards first');
  else if (doc.locked) problems.push('The awards are already locked');
  else problems.push(...awardProblems(state, lastSeason, doc));
  if (problems.length || !doc) return seasonFail(problems);

  const teamOf = new Map(Object.entries(state.rosters.teams).flatMap(([t, es]) => es.filter(e => e.playerId).map(e => [e.playerId!, t] as const)));
  const awards = doc.awards.map(a => ({ ...a, teamId: teamOf.get(a.playerId) ?? a.teamId }));
  const slot = (s: AllFbaSlot): AllFbaSlot => (s.playerId ? { ...s, teamId: teamOf.get(s.playerId) ?? s.teamId } : s);
  const allFba = doc.allFba && { team1: doc.allFba.team1.map(slot), team2: doc.allFba.team2.map(slot) };
  const locked: AwardsFile = { ...doc, locked: true, awards, allFba };

  const who = (id: string, team: string | null) => `${playerName(state, id)} (${team ?? '?'})`;
  const lines = [`S${state.season} ${LEAGUE_NAME[state.league]} awards: ${awards.map(a => `${AWARD_LABEL[a.award]} ${who(a.playerId, a.teamId)}`).join(', ')}`];
  if (allFba) {
    lines.push(`All-FBA 1st team: ${allFba.team1.map(s => `${s.slot} ${who(s.playerId!, s.teamId)}`).join(', ')}`);
    lines.push(`All-FBA 2nd team: ${allFba.team2.map(s => `${s.slot} ${who(s.playerId!, s.teamId)}`).join(', ')}`);
  }
  const teams = [...new Set([...awards.map(a => a.teamId), ...(allFba ? [...allFba.team1, ...allFba.team2].map(s => s.teamId!) : [])])];
  const tx = appendTx(state.tx, ctx, 'awards', teams, lines);
  return {
    ok: true,
    state: { ...state, awards: locked, tx },
    changed: ['awards', 'tx'],
    label: `Lock S${state.season} ${LEAGUE_NAME[state.league]} awards`,
  };
}
