import type { SeasonLeague } from '../../engine/season/schedule';
import { nextPause, seasonDocPath, type SeasonDocKey, type SeasonState } from '../../engine/season/state';
import type {
  AllStarFile, CalendarFile, MetaFile, PlayersFile, RatingPauseFile, ResultsFile, RostersFile, ScheduleFile, TeamsFile, TransactionsFile,
} from '../../engine/shared/types';
import { useDoc, type DocState, type Versions } from '../api';

/** Loads one league's season docs plus the version of every doc a season move may write. */
export function useSeasonState(league: SeasonLeague | null): { state?: SeasonState; versions: Versions; error?: Error; reload: () => void } {
  const meta = useDoc<MetaFile>('meta.json');
  const season = meta.data?.currentSeason;
  const on = league !== null && season !== undefined;
  const at = (key: SeasonDocKey) => (on ? seasonDocPath(key, league, season) : null);
  const teams = useDoc<TeamsFile>(league ? `leagues/${league}/teams.json` : null);
  const rosters = useDoc<RostersFile>(at('rosters'));
  const players = useDoc<PlayersFile>(on ? 'players.json' : null);
  const calendar = useDoc<CalendarFile>(at('calendar'));
  const tx = useDoc<TransactionsFile>(at('tx'));
  const schedule = useDoc<ScheduleFile>(at('schedule'));
  const results = useDoc<ResultsFile>(at('results'));
  const allstar = useDoc<AllStarFile>(on && league === 'fba' ? seasonDocPath('allstar', 'fba', season) : null);
  const pause = league === 'fba' ? nextPause(schedule.data ?? null) : null;
  const pausePath = on && pause?.kind === 'ratings' ? seasonDocPath('ratingPause', 'fba', season, pause.afterGame) : null;
  const ratingPause = useDoc<RatingPauseFile>(pausePath);

  const reload = (): void => {
    for (const d of [meta, teams, rosters, players, calendar, tx, schedule, results, allstar, ratingPause]) d.reload();
  };

  const versions: Versions = {};
  if (on) {
    const keyed: [SeasonDocKey, DocState<unknown>][] = [['rosters', rosters], ['calendar', calendar], ['tx', tx], ['schedule', schedule], ['results', results]];
    for (const [k, d] of keyed) versions[seasonDocPath(k, league, season)] = d.version;
    if (league === 'fba') versions[seasonDocPath('allstar', 'fba', season)] = allstar.version;
    if (pausePath) versions[pausePath] = ratingPause.version;
  }

  const required: DocState<unknown>[] = [meta, teams, rosters, players, calendar, tx];
  const optional: DocState<unknown>[] = [schedule, results, ...(league === 'fba' ? [allstar] : []), ...(pausePath ? [ratingPause] : [])];
  const error = required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  if (!on || required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)) return { versions, error, reload };
  return {
    versions,
    reload,
    state: {
      league, season,
      teams: teams.data!, rosters: rosters.data!, players: players.data!, calendar: calendar.data!, tx: tx.data!,
      schedule: schedule.data ?? null, results: results.data ?? null,
      ratingPause: ratingPause.data ?? null, allstar: allstar.data ?? null,
    },
  };
}
