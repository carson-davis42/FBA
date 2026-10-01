import type { CalendarFile, PlayersFile, QualifyingFile, RostersFile, SummaryFile, TeamsFile, WcHostsFile, WorldCupFile } from '../../engine/shared/types';
import { docSettled, useDoc, type Versions } from '../api';

export interface WcDocs {
  ready: boolean;
  error?: Error;
  versions: Versions;
  reload: () => void;
  calendar: CalendarFile | null;
  teams: TeamsFile | null;
  players: PlayersFile | null;
  hosts: WcHostsFile | null;
  d2Rosters: RostersFile | null;
  rosters: RostersFile | null;
  previousRosters: RostersFile | null;
  qualifying: QualifyingFile | null;
  worldCup: WorldCupFile | null;
  summary: SummaryFile | null;
}

/**
 * Loads the docs the World Cup pages need. Qualifying is played in the odd season before the finals, so an even
 * (World Cup) season reads it from the previous season. A missing doc is null, never an error.
 */
export function useWcDocs(season: number | null): WcDocs {
  const on = season !== null;
  const wc = (s: number, file: string) => `leagues/fbawc/S${s}/${file}`;
  const qualifyingSeason = on ? (season % 2 === 0 ? season - 1 : season) : 0;
  const calendar = useDoc<CalendarFile>(on ? 'calendar.json' : null);
  const teams = useDoc<TeamsFile>(on ? 'leagues/fbawc/teams.json' : null);
  const players = useDoc<PlayersFile>(on ? 'players.json' : null);
  const hosts = useDoc<WcHostsFile>(on ? 'leagues/fbawc/hosts.json' : null);
  const d2Rosters = useDoc<RostersFile>(on ? `leagues/fbad2/S${season}/rosters.json` : null);
  const rosters = useDoc<RostersFile>(on ? wc(season, 'rosters.json') : null);
  const previousRosters = useDoc<RostersFile>(on ? wc(season - 1, 'rosters.json') : null);
  const qualifying = useDoc<QualifyingFile>(on ? wc(qualifyingSeason, 'qualifying.json') : null);
  const worldCup = useDoc<WorldCupFile>(on ? wc(season, 'worldcup.json') : null);
  const summary = useDoc<SummaryFile>(on ? wc(season, 'summary.json') : null);
  const all = [calendar, teams, players, hosts, d2Rosters, rosters, previousRosters, qualifying, worldCup, summary];

  const reload = (): void => { for (const d of all) d.reload(); };

  const versions: Versions = {};
  if (on) {
    versions['calendar.json'] = calendar.version;
    versions[wc(season, 'rosters.json')] = rosters.version;
    versions[wc(qualifyingSeason, 'qualifying.json')] = qualifying.version;
    versions[wc(season, 'worldcup.json')] = worldCup.version;
    versions[wc(season, 'summary.json')] = summary.version;
  }

  const error = all.find(d => d.error && !d.missing)?.error;
  return {
    ready: on && all.every(docSettled),
    error,
    versions,
    reload,
    calendar: calendar.data ?? null,
    teams: teams.data ?? null,
    players: players.data ?? null,
    hosts: hosts.data ?? null,
    d2Rosters: d2Rosters.data ?? null,
    rosters: rosters.data ?? null,
    previousRosters: previousRosters.data ?? null,
    qualifying: qualifying.data ?? null,
    worldCup: worldCup.data ?? null,
    summary: summary.data ?? null,
  };
}
