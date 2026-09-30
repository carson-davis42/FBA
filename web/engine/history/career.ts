import type { AwardKey } from '../shared/types';

export type StintKind = 'college' | 'fba' | 'd2' | 'wc';
export interface Honour { label: string; count: number; seasons: number[] }
export interface Stint { kind: StintKind; team: string; range: string; from: number | null; to: number | 'pres' | null; honours: Honour[] }
export interface Career { stints: Stint[]; hof: string | null; other: string[] }

const STINT = /^(.+?)\s*-\s*((?:S\d+|FFL|pres\.)(?:\s*-\s*(?:S\d+|FFL|pres\.))?(?:\s*;\s*(?:S\d+|FFL)(?:\s*-\s*(?:S\d+|FFL|pres\.))?)*)$/;
// Every FBA team code in the Players-tab bios. A shape rule can't be used: colleges such as Duke, UCLA and BYU look like team codes.
const FBA_TEAMS = new Set(['?', 'ATL', 'BOS', 'CAR', 'CGG', 'CHA', 'CHI', 'CIN', 'CP', 'CT', 'DCB', 'DEN', 'DET', 'FLO', 'FP', 'HON', 'LA',
  'MAN', 'MEM', 'MIL', 'MON', 'MW', 'NO', 'NY', 'OAK', 'OV', 'PHX', 'SAS', 'SEA', 'SOX', 'STL', 'TEX', 'TOR', 'USA', 'VAN', 'VEG']);

function kindOf(team: string): StintKind {
  if (team.startsWith('WC(')) return 'wc';
  if (team.startsWith('D2(')) return 'd2';
  if (team.split('/').every(p => FBA_TEAMS.has(p))) return 'fba';
  return 'college';
}

function seasonOf(token: string): number | null {
  const m = /^S(\d+)$/.exec(token);
  return m ? Number(m[1]) : null;
}

export function parseBio(bio: { born: string; entries: string[] }): Career {
  const career: Career = { stints: [], hof: null, other: [] };
  for (const raw of bio.entries) {
    const entry = raw.trim();
    const hof = /^HOF-(S\d+|FFL)$/.exec(entry);
    if (hof) { career.hof = hof[1]; continue; }
    const stint = career.stints[career.stints.length - 1];
    const count = /^(\d+)x (.+)$/.exec(entry);
    const single = /^S(\d+) (.+)$/.exec(entry);
    if (count || single) {
      if (!stint) { career.other.push(entry); continue; }
      if (count) {
        stint.honours.push({ label: count[2].trim(), count: Number(count[1]), seasons: [] });
      } else if (single) {
        const label = single[2].trim();
        const season = Number(single[1]);
        const same = stint.honours.find(h => h.label.toLowerCase() === label.toLowerCase());
        if (same) { same.count += 1; same.seasons.push(season); }
        else stint.honours.push({ label, count: 1, seasons: [season] });
      }
      continue;
    }
    const m = STINT.exec(entry);
    if (m) {
      const team = m[1].trim();
      const range = m[2];
      const tokens = range.split(/[-;]/).map(t => t.trim());
      const first = tokens[0];
      const last = tokens[tokens.length - 1];
      career.stints.push({
        kind: kindOf(team), team, range,
        from: seasonOf(first),
        to: last === 'pres.' ? 'pres' : seasonOf(last),
        honours: [],
      });
      continue;
    }
    career.other.push(entry);
  }
  return career;
}

const LABEL_KEYS: Record<string, AwardKey> = {
  'mvp': 'MVP',
  'roty': 'ROTY',
  'ppk award': 'PPK',
  'lp award': 'LP',
  'mc award': 'MC',
  'dpoy': 'DPOY',
  'mip': 'MIP',
  'all-fba t1': 'ALL_FBA_1',
  'all-fba t2': 'ALL_FBA_2',
  'all-star': 'ALL_STAR',
  'young-star': 'YOUNG_STAR',
  'asg mvp': 'ASG_MVP',
  'ysg mvp': 'YSG_MVP',
  'fba c-ship mvp': 'FINALS_MVP',
  'fba champion': 'CHAMPION',
  'fba c-ship app.': 'CSHIP_APP',
  'ec champion': 'CONF_CHAMPION',
  'wc champion': 'CONF_CHAMPION',
};

export function bioAwardKey(label: string): AwardKey | null {
  return LABEL_KEYS[label.trim().toLowerCase()] ?? null;
}

export function careerAwardSums(career: Career): Partial<Record<AwardKey, number>> {
  const sums: Partial<Record<AwardKey, number>> = {};
  for (const stint of career.stints) {
    if (stint.kind !== 'fba') continue;
    for (const h of stint.honours) {
      const key = bioAwardKey(h.label);
      if (key) sums[key] = (sums[key] ?? 0) + h.count;
    }
  }
  return sums;
}
