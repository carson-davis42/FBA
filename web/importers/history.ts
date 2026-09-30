import {
  PlayerBiosFile, SummaryFile,
  type AwardEntry, type Champion, type PastAllFbaSlot, type PastBracket, type PastSeries, type PlayerBio, type PlayersFile, type SummaryAllStar,
  type SummaryStanding, type Team,
} from '../engine/shared/types';
import type { Report } from './report';
import { decodeScore, splitNameTeam, type AllFbaSeason, type AwardKey, type AwardsRow, type BioRow, type ChampRow, type NameTeam, type StandingRow } from './sheets/history';
import { parsePlayersTab } from './sheets/playersTab';

export interface HistoryInput {
  players: PlayersFile;
  teams: Team[];
  /** The S<=78 summary files already on disk. */
  existing: Map<number, SummaryFile>;
  champs: ChampRow[];
  awards: AwardsRow[];
  allFba: AllFbaSeason[];
  standings: Map<number, StandingRow[]>;
  bios: BioRow[];
  brackets: { season: number; rounds: number; series: PastSeries[] }[];
}

export interface HistoryOutput { players: PlayersFile; bios: PlayerBiosFile; summaries: SummaryFile[] }

/** Trimmed, curly apostrophe straightened, accents stripped, lowercased. */
export const normName = (s: string): string => s.trim().replace(/’/g, "'").normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Resolves a name to one player id; an unmatched or ambiguous name is a report warning and gives null. */
export function nameResolver(players: PlayersFile, report: Report, topic = 'names'): (name: string, where: string) => string | null {
  const index = new Map<string, string[]>();
  for (const p of Object.values(players.players)) {
    if (p.name === null) continue;
    const key = normName(p.name);
    index.set(key, [...(index.get(key) ?? []), p.id]);
  }
  return (name, where) => {
    const m = index.get(normName(name)) ?? [];
    if (m.length === 1) return m[0];
    report.warn(topic, `${m.length === 0 ? 'Unmatched' : 'Ambiguous'}: ${name} (${where})`);
    return null;
  };
}

const LAST_SEASON = 78;
const FIRST_STANDINGS_SEASON = 71;
/** Bracket spellings kept as printed, mapped to the standings spelling; used only for standings matching. */
const STANDINGS_ALIAS: Record<string, string> = { [normName('Denver Height')]: normName('Denver Heights') };
const standingsKey = (name: string): string => {
  const n = normName(name);
  return STANDINGS_ALIAS[n] ?? n;
};
const AWARD_ORDER: AwardKey[] = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP'];

const finalOf = (b: { rounds: number; series: PastSeries[] }): PastSeries | undefined => b.series.find(s => s.round === b.rounds);

/** Checks the bracket's final against the Championships row (H7). */
function checkFinal(season: number, b: { rounds: number; series: PastSeries[] }, c: ChampRow, report: Report): void {
  const final = finalOf(b);
  const win = final?.[final.winner];
  const lose = final?.[final.winner === 'home' ? 'away' : 'home'];
  if (!final || !win || !lose) {
    report.warn('brackets', `S${season}: the bracket has no complete final`);
    return;
  }
  const winWins = final[`${final.winner}Wins`];
  const loseWins = final[final.winner === 'home' ? 'awayWins' : 'homeWins'];
  const m = c.score === null ? null : /^(\d+)[–-](\d+)$/.exec(c.score);
  const ok = normName(win.name) === normName(c.champion)
    && (c.runnerUp === null || normName(lose.name) === normName(c.runnerUp))
    && (m === null || (Number(m[1]) === winWins && Number(m[2]) === loseWins));
  if (!ok) {
    report.warn('brackets', `S${season}: final ${win.name} ${winWins}–${loseWins} ${lose.name} vs sheet ${c.champion} ${c.score ?? '?'} ${c.runnerUp ?? '?'}`);
  }
}

/** The last round a team played in a transcribed bracket, and whether it won the final. */
function playoffFromBracket(name: string, b: { rounds: number; series: PastSeries[] }): SummaryStanding['playoff'] {
  const n = standingsKey(name);
  let round = 0;
  for (const s of b.series) {
    if ((s.home && standingsKey(s.home.name) === n) || (s.away && standingsKey(s.away.name) === n)) round = Math.max(round, s.round);
  }
  if (round === 0) return null;
  const final = finalOf(b);
  const win = final?.[final.winner];
  return { round, champion: !!win && standingsKey(win.name) === n };
}

export function buildHistory(input: HistoryInput, report: Report): HistoryOutput {
  // ---- Players (H2, H3) ----
  const playersOut: PlayersFile = { nextId: input.players.nextId, players: { ...input.players.players } };
  const index = new Map<string, string[]>();
  const indexPlayer = (id: string, name: string | null) => {
    if (name === null) return;
    const key = normName(name);
    index.set(key, [...(index.get(key) ?? []), id]);
  };
  for (const p of Object.values(playersOut.players)) indexPlayer(p.id, p.name);

  const bios: PlayerBio[] = [];
  const biographed = new Set<string>();
  for (const b of input.bios) {
    const matches = index.get(normName(b.name)) ?? [];
    let id: string;
    if (matches.length === 0) {
      id = `p${String(playersOut.nextId).padStart(5, '0')}`;
      playersOut.nextId += 1;
      playersOut.players[id] = { id, name: b.name, birthSeason: parsePlayersTab([[b.name, b.born]])[0].born };
      indexPlayer(id, b.name);
    } else if (matches.length === 1) {
      id = matches[0];
      const stored = playersOut.players[id];
      if (stored.name !== b.name) {
        report.info('names', `Renamed: ${stored.name} → ${b.name}`);
        playersOut.players[id] = { ...stored, name: b.name };
      }
    } else {
      report.warn('names', `Ambiguous: ${b.name}`);
      continue;
    }
    if (biographed.has(id)) {
      report.warn('names', `Duplicate bio: ${b.name}`);
      continue;
    }
    biographed.add(id);
    bios.push({ playerId: id, born: b.born, entries: b.entries });
  }
  bios.sort((a, b) => a.playerId.localeCompare(b.playerId));
  const biosOut: PlayerBiosFile = { league: 'fba', bios };
  const biosCheck = PlayerBiosFile.safeParse(biosOut);
  if (!biosCheck.success) report.error('schema', `playerBios.json: ${biosCheck.error.issues.slice(0, 3).map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`);

  const lookup = (name: string): string[] => index.get(normName(name)) ?? [];
  const resolve = (name: string, season: number, field: string): string | null => {
    const m = lookup(name);
    if (m.length === 1) return m[0];
    report.warn('names', `${m.length === 0 ? 'Unmatched' : 'Ambiguous'}: ${name} (S${season} ${field})`);
    return null;
  };
  /** Tries the whole cell text first (a hyphenated surname), then the split name. */
  const resolveNT = (nt: NameTeam | null, season: number, field: string): string | null => {
    if (!nt) return null;
    const whole = nt.team === null ? nt.name : `${nt.name}-${nt.team}`;
    return resolve(lookup(whole).length > 0 ? whole : nt.name, season, field);
  };
  /** The Finals MVP cell may carry a "-TEAM" suffix; try the whole text first. */
  const resolveFinalsMvp = (cellText: string, season: number): string | null => {
    if (lookup(cellText).length > 0) return resolve(cellText, season, 'finalsMvp');
    const split = splitNameTeam(cellText);
    return resolve(split && lookup(split.name).length > 0 ? split.name : cellText, season, 'finalsMvp');
  };

  const teamByName = new Map(input.teams.map(t => [t.name, t.teamId]));
  const champBySeason = new Map(input.champs.map(c => [c.season, c]));
  const awardsBySeason = new Map(input.awards.map(a => [a.season, a]));
  const allFbaBySeason = new Map(input.allFba.map(a => [a.season, a]));
  const bracketBySeason = new Map(input.brackets.map(b => [b.season, b]));

  const summaries: SummaryFile[] = [];
  for (let n = 1; n <= LAST_SEASON; n++) {
    const base = input.existing.get(n) ?? { league: 'fba' as const, season: n, locked: true, host: null, champions: [] };
    const out: SummaryFile = { ...base, league: 'fba', season: n, locked: true };

    // The FBA Champion entry.
    const champ = champBySeason.get(n);
    if (champ) {
      const at = base.champions.findIndex(c => c.title === 'FBA Champion');
      const prev: Partial<Champion> = at >= 0 ? base.champions[at] : {};
      const entry: Champion = {
        ...prev,
        title: 'FBA Champion',
        champion: champ.champion,
        runnerUp: champ.runnerUp,
        score: champ.score,
        finalsMvp: (champ.finalsMvp === null ? null : resolveFinalsMvp(champ.finalsMvp, n)) ?? prev.finalsMvp ?? null,
      };
      const teamId = teamByName.get(champ.champion);
      if (teamId) entry.teamId = teamId;
      const runnerUpId = champ.runnerUp === null ? undefined : teamByName.get(champ.runnerUp);
      if (runnerUpId) entry.runnerUpId = runnerUpId;
      out.champions = at >= 0 ? base.champions.map((c, i) => (i === at ? entry : c)) : [entry, ...base.champions];
    }

    // Awards, conference champions and the All-Star weekend.
    const aw = awardsBySeason.get(n);
    if (aw) {
      out.confChampions = { E: aw.east, W: aw.west };
      const awards: AwardEntry[] = [];
      for (const key of AWARD_ORDER) {
        const nt = aw.awards[key];
        const playerId = resolveNT(nt ?? null, n, key);
        if (nt && playerId) awards.push({ award: key, playerId, teamId: nt.team ?? '?' });
      }
      out.awards = awards;
      const allStar: SummaryAllStar = {
        allStars: [],
        youngStars: [],
        asgMvp: resolveNT(aw.asgMvp, n, 'asgMvp'),
        fivePoint: resolveNT(aw.fivePoint, n, 'fivePoint'),
        dunk: resolveNT(aw.dunk, n, 'dunk'),
        asgWinner: aw.asgWinner,
        asgLoser: aw.asgLoser,
        ysgWinner: aw.ysgWinner,
        ysgMvp: resolveNT(aw.ysgMvp, n, 'ysgMvp'),
      };
      const empty = [allStar.asgMvp, allStar.fivePoint, allStar.dunk, allStar.asgWinner, allStar.asgLoser, allStar.ysgWinner, allStar.ysgMvp].every(v => v === null);
      out.allStar = empty ? null : allStar;
    } else {
      out.awards = [];
      out.confChampions = null;
      out.allStar = null;
    }

    // All-FBA teams.
    const af = allFbaBySeason.get(n);
    if (af && af.slots.length > 0) {
      const team = (which: 'team1' | 'team2'): PastAllFbaSlot[] => af.slots.map((slot, i) => {
        const nt = af[which][i] ?? null;
        const playerId = resolveNT(nt, n, `All-FBA ${which === 'team1' ? 'team 1' : 'team 2'} ${slot}`);
        return { slot: slot as PastAllFbaSlot['slot'], playerId, teamId: playerId ? nt?.team ?? null : null };
      });
      out.allFba = { team1: team('team1'), team2: team('team2') };
    } else {
      out.allFba = null;
    }

    // Bracket, final check and standings.
    const bracket = bracketBySeason.get(n);
    if (bracket) {
      const pb: PastBracket = { rounds: bracket.rounds, series: bracket.series };
      out.pastBracket = pb;
      if (champ) checkFinal(n, bracket, champ, report);
    } else {
      out.pastBracket = null;
      report.info('brackets', `No bracket: S${n}`);
    }

    const rows = input.standings.get(n);
    if (rows && rows.length > 0) {
      if (bracket) {
        const known = new Set(rows.map(r => standingsKey(r.name)));
        const seen = new Set<string>();
        for (const s of bracket.series) {
          for (const side of [s.home, s.away]) {
            if (!side || seen.has(standingsKey(side.name))) continue;
            seen.add(standingsKey(side.name));
            if (!known.has(standingsKey(side.name))) report.warn('brackets', `S${n}: bracket team "${side.name}" is not in the standings`);
          }
        }
      }
      out.standings = rows.map((r): SummaryStanding => {
        let playoff: SummaryStanding['playoff'] = null;
        if (bracket) playoff = playoffFromBracket(r.name, bracket);
        else if (champ && normName(r.name) === normName(champ.champion)) playoff = { round: 4, champion: true };
        else if (champ?.runnerUp && normName(r.name) === normName(champ.runnerUp)) playoff = { round: 4, champion: false };
        return {
          teamId: teamByName.get(r.name) ?? r.name,
          name: r.name,
          group: r.group,
          rank: r.rank,
          w: r.w,
          l: r.l,
          confW: null,
          confL: null,
          diff: null,
          marker: null,
          seed: null,
          playoff,
        };
      });
    } else if (n >= FIRST_STANDINGS_SEASON) {
      out.standings = [];
      report.warn('standings', `S${n}: no standings rows in the sheet`);
    }

    const check = SummaryFile.safeParse(out);
    if (!check.success) report.error('schema', `S${n} summary: ${check.error.issues.slice(0, 3).map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    summaries.push(out);
  }
  return { players: playersOut, bios: biosOut, summaries };
}
