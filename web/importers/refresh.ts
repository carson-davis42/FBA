import { normalizeName } from '../engine/shared/names';
import type { FreeAgentsFile, PickObligation, PicksFile, PlayersFile, ReservesFile, TeamsFile, TransactionsFile } from '../engine/shared/types';
import { rosterFromSheet } from './assemble';
import { PlayerRegistry } from './registry';
import type { Report } from './report';
import type { ParsedFreeAgent, ParsedPick, SheetPlayer, SheetTeam } from './sheets/parsers';

export interface RefreshInputs {
  season: number;
  players: PlayersFile;
  fbaTeams: TeamsFile;
  d2Teams: TeamsFile;
  fbaSheet: SheetTeam[];
  d2Sheet: SheetTeam[];
  reserves: SheetPlayer[];
  freeAgents: ParsedFreeAgent[];
  picks: ParsedPick[];
}

export function assembleRefresh(inp: RefreshInputs, report: Report): Record<string, unknown> {
  const { season } = inp;
  const reg = PlayerRegistry.fromFile(inp.players, report);
  const birth = (age: number | null) => (age === null ? null : season - age);
  const teamsOf = (t: TeamsFile) => t.teams.map(x => ({ name: x.name, abbr: x.teamId }));

  const fba = rosterFromSheet('fba', season, inp.fbaSheet, teamsOf(inp.fbaTeams), reg, report);
  const d2 = rosterFromSheet('fbad2', season, inp.d2Sheet, teamsOf(inp.d2Teams), reg, report);

  const abbrOf = new Map(inp.fbaTeams.teams.map(t => [t.name, t.teamId]));
  const d2AbbrOf = new Map(inp.d2Teams.teams.map(t => [t.name, t.teamId]));
  const rostered = new Map<string, string>();
  for (const t of inp.fbaSheet) for (const p of t.players) if (p.name) rostered.set(normalizeName(p.name), abbrOf.get(t.name) ?? t.name);
  const d2Rostered = new Map<string, string>();
  for (const t of inp.d2Sheet) for (const p of t.players) if (p.name) d2Rostered.set(normalizeName(p.name), d2AbbrOf.get(t.name) ?? t.name);

  const reserves: ReservesFile = {
    league: 'fbad2', season, locked: false,
    players: inp.reserves.flatMap(p => {
      const onD2Team = d2Rostered.get(normalizeName(p.name));
      if (onD2Team) {
        report.info('reserves', `${p.name} is listed in D2 Reserves but is on the D2 ${onD2Team} roster; he'll show there`);
        return [];
      }
      return [{ playerId: reg.add(p.name, birth(p.age), `fbad2-res:S${season}`), position: p.position, age: p.age, rating: p.rating }];
    }),
  };
  const reservedNames = new Set(inp.reserves.map(p => normalizeName(p.name)));

  const freeAgents: FreeAgentsFile = { league: 'fba', season, locked: false, players: [] };
  for (const fa of inp.freeAgents) {
    const normalized = normalizeName(fa.name);
    const onTeam = rostered.get(normalized);
    if (onTeam) {
      report.info('free agents', `${fa.name} is listed as a free agent but is on the ${onTeam} roster; he'll show there (as an expired contract if it has ended)`);
      continue;
    }
    const onD2Team = d2Rostered.get(normalized);
    if (onD2Team) {
      report.info('free agents', `${fa.name} is listed as a free agent but is on the D2 ${onD2Team} roster; he'll show there`);
      continue;
    }
    if (reservedNames.has(normalized)) {
      report.info('free agents', `${fa.name} is listed as a free agent but is also in D2 Reserves; he'll show there`);
      continue;
    }
    freeAgents.players.push({
      playerId: reg.add(fa.name, birth(fa.age), `fba-fa:S${season}`),
      position: fa.position, age: fa.age, rating: fa.rating, rookie: fa.age !== null && fa.age <= 22, note: fa.note,
    });
  }
  const rookies = freeAgents.players.filter(p => p.rookie).length;
  report.info('free agents', `${freeAgents.players.length} free agents imported (${rookies} treated as undrafted rookies because they are 22 or younger)`);

  const known = new Set(inp.fbaTeams.teams.map(t => t.teamId));
  const obligations: PickObligation[] = [];
  for (const p of inp.picks) {
    if (!known.has(p.owner) || !known.has(p.originalTeam)) {
      report.error('picks', `S${p.season} pick ${p.owner}(via ${p.originalTeam}): unknown team`);
      continue;
    }
    const taken = obligations.filter(o => o.season === p.season && o.originalTeam === p.originalTeam).map(o => o.priority);
    const priority = p.priority ?? (taken.length ? Math.max(...taken) + 1 : 1);
    obligations.push({
      id: `imp-S${p.season}-${p.originalTeam}-${priority}`,
      season: p.season, originalTeam: p.originalTeam, owner: p.owner,
      condition: p.condition, originalCondition: p.originalCondition, originSeason: p.originSeason,
      priority, rolls: [], note: '',
    });
  }
  const picks: PicksFile = { league: 'fba', obligations };
  const emptyTx = (league: 'fba' | 'fbad2'): TransactionsFile => ({ league, season, entries: [] });

  return {
    [`leagues/fba/S${season}/rosters.json`]: fba,
    [`leagues/fbad2/S${season}/rosters.json`]: d2,
    [`leagues/fba/S${season}/freeAgents.json`]: freeAgents,
    [`leagues/fbad2/S${season}/reserves.json`]: reserves,
    'leagues/fba/picks.json': picks,
    [`leagues/fba/S${season}/transactions.json`]: emptyTx('fba'),
    [`leagues/fbad2/S${season}/transactions.json`]: emptyTx('fbad2'),
    'players.json': reg.toFile(),
  };
}
