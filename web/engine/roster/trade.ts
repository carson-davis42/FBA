import type { PickCondition, PickObligation } from '../shared/types';
import { lockProblem } from '../season/locks';
import { futureSeasons, nextPriority, pickLabel } from './picks';
import { capProblem, normalizeRoster, payroll, slotProblems, TRADE_CAP } from './rules';
import { appendTx, type DocKey, fail, type MoveContext, type MoveResult, nameOf, type RosterState, withLeague, withTeam } from './state';

export type TradeAsset =
  | { kind: 'player'; playerId: string; from: string; to: string }
  | { kind: 'pick'; obligationId: string; from: string; to: string }
  | { kind: 'ownPick'; season: number; from: string; to: string; condition: PickCondition };

export interface TradeInput {
  league: 'fba' | 'fbad2';
  teams: string[];
  assets: TradeAsset[];
}

export function makeTrade(state: RosterState, input: TradeInput, ctx: MoveContext): MoveResult {
  // Only the FBA trades.
  if (input.league !== 'fba') return fail(['D2 teams do not trade']);
  const locked = lockProblem(ctx.phase, input.league, 'trade');
  if (locked) return fail([locked]);
  const key = input.league === 'fba' ? 'fba' : 'd2';
  const txKey = input.league === 'fba' ? 'fbaTx' : 'd2Tx';
  const problems: string[] = [];
  const teams = [...new Set(input.teams)];
  if (teams.length < 2) problems.push('A trade needs at least two teams');
  for (const t of teams) if (!state[key].teams[t]) problems.push(`Unknown team ${t}`);
  if (!input.assets.length) problems.push('Add at least one player or pick');
  if (problems.length) return fail(problems);

  let rosters = state[key];
  let obligations: PickObligation[] = state.picks.obligations;
  const lines: string[] = [];
  const seasons = futureSeasons(state.season);
  let created = 0;

  for (const a of input.assets) {
    if (!teams.includes(a.from) || !teams.includes(a.to) || a.from === a.to) {
      problems.push('Every asset must move between two different teams in the trade');
      continue;
    }
    if (a.kind === 'player') {
      const entry = rosters.teams[a.from].find(e => e.playerId === a.playerId);
      if (!entry) {
        problems.push(`${nameOf(state, a.playerId)} is not on ${a.from}`);
        continue;
      }
      rosters = withTeam(rosters, a.from, normalizeRoster(rosters.teams[a.from].filter(e => e !== entry), input.league));
      rosters = withTeam(rosters, a.to, normalizeRoster([...rosters.teams[a.to], entry], input.league));
      lines.push(`->${a.to} ${entry.position}-${nameOf(state, a.playerId)}`);
      continue;
    }
    if (input.league !== 'fba') {
      problems.push('Only FBA trades can include draft picks');
      continue;
    }
    if (a.kind === 'pick') {
      const ob = obligations.find(o => o.id === a.obligationId);
      if (!ob || ob.owner !== a.from) {
        problems.push(`${a.from} does not own pick ${a.obligationId}`);
        continue;
      }
      const moved = { ...ob, owner: a.to };
      obligations = obligations.map(o => (o === ob ? moved : o));
      lines.push(`->${a.to} ${pickLabel(moved)}`);
      continue;
    }
    if (!seasons.includes(a.season)) {
      problems.push(`Picks can be traded for S${seasons[0]}–S${seasons.at(-1)}`);
      continue;
    }
    const c = a.condition;
    if (c.kind === 'swap' && (!state.fba.teams[c.otherTeam] || ![a.from, c.otherTeam].includes(c.betterTo))) {
      problems.push('A pick swap needs another team and must name which of the two gets the better pick');
      continue;
    }
    created += 1;
    const ob: PickObligation = {
      id: `${ctx.batchId}-${created}`,
      season: a.season,
      originalTeam: a.from,
      owner: a.to,
      condition: c,
      originalCondition: c,
      originSeason: a.season,
      priority: nextPriority(obligations, a.season, a.from),
      rolls: [],
      note: '',
    };
    obligations = [...obligations, ob];
    lines.push(`->${a.to} ${pickLabel(ob)}`);
  }
  if (problems.length) return fail(problems);

  const slotIssues = teams.flatMap(t => slotProblems(t, rosters.teams[t]));
  if (input.league === 'fba') {
    for (const t of teams) {
      const cap = capProblem(payroll(rosters.teams[t], state.season), TRADE_CAP);
      if (cap) problems.push(`${t}: ${cap}`);
    }
    if (state.freeAgents.locked) problems.push(...slotIssues);
  }
  if (problems.length) return fail(problems);

  const changed: DocKey[] = [key, txKey];
  if (obligations !== state.picks.obligations) changed.push('picks');
  return {
    ok: true,
    state: { ...withLeague(state, input.league, rosters, appendTx(state[txKey], ctx, 'trade', teams, lines)), picks: { ...state.picks, obligations } },
    changed,
    label: `Trade ${teams.join('/')}`,
    warnings: input.league === 'fba' && state.freeAgents.locked ? [] : slotIssues,
  };
}
