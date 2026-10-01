import type { CalendarFile, JcRankingsFile, JcScheduleFile, PlayersFile, ResultsFile, RostersFile, SummaryFile, TeamsFile } from '../../engine/shared/types';
import { jcDocPath, type JcState } from '../../engine/jc/state';
import { docSettled, useDoc, type Versions } from '../api';

export interface JcDocs {
  state: JcState | null;
  versions: Versions;
  loading: boolean;
  error: string;
  reload: () => void;
  lastSummary: SummaryFile | null;
}

/** Loads the docs the Junior College pages need for one season. A missing season doc is null with a null version, never an error. */
export function useJcDocs(season: number | null): JcDocs {
  const on = season !== null;
  const s = season ?? 0;
  const path = (file: string) => `leagues/fbajc/S${s}/${file}`;
  const calendar = useDoc<CalendarFile>(on ? 'calendar.json' : null);
  const teams = useDoc<TeamsFile>(on ? 'leagues/fbajc/teams.json' : null);
  const players = useDoc<PlayersFile>(on ? 'players.json' : null);
  const rosters = useDoc<RostersFile>(on ? path('rosters.json') : null);
  const schedule = useDoc<JcScheduleFile>(on ? path('schedule.json') : null);
  const results = useDoc<ResultsFile>(on ? path('results.json') : null);
  const rankings = useDoc<JcRankingsFile>(on ? path('rankings.json') : null);
  const summary = useDoc<SummaryFile>(on ? path('summary.json') : null);
  const previous = useDoc<SummaryFile>(on ? `leagues/fbajc/S${s - 1}/summary.json` : null);
  const all = [calendar, teams, players, rosters, schedule, results, rankings, summary, previous];

  const reload = (): void => { for (const d of all) d.reload(); };

  const versions: Versions = {};
  if (on) {
    versions[jcDocPath('rosters', s)] = rosters.version;
    versions[jcDocPath('schedule', s)] = schedule.version;
    versions[jcDocPath('results', s)] = results.version;
    versions[jcDocPath('rankings', s)] = rankings.version;
  }

  const failed = all.find(d => d.error && !d.missing)?.error;
  const loading = on && !failed && !all.every(docSettled);
  const required = [calendar, teams, players, rosters];
  const state: JcState | null = on && !loading && required.every(d => d.data)
    ? {
        season: s,
        calendar: calendar.data!,
        teams: teams.data!,
        players: players.data!,
        rosters: rosters.data!,
        schedule: schedule.data ?? null,
        results: results.data ?? null,
        rankings: rankings.data ?? null,
        summary: summary.data ?? null,
      }
    : null;
  return { state, versions, loading, error: failed?.message ?? '', reload, lastSummary: previous.data ?? null };
}
