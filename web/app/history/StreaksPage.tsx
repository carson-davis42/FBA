import { useEffect, useState } from 'react';
import { allTimeStreaks, currentStreaks, seasonSpan, STREAK_TRACKING_START, trackStreaks, type StreakEntry, type StreakRun, type TrackedSeason } from '../../engine/history/streaks';
import type { Franchise, FranchisesFile, MetaFile, PlayoffsFile, ResultsFile, StreakRecordsFile, Team } from '../../engine/shared/types';
import { docFailure, docSettled, useDoc } from '../api';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { useFbaTeams } from './useTeams';
import './history.css';

const LIST_SIZE = 20;
const ACTIVE_MIN = 3;

/** The games of every tracked season through `last`: each regular season's results and its playoff games, when the file exists. */
function useTrackedSeasons(last: number | null): TrackedSeason[] | null {
  const [state, setState] = useState<{ last: number; seasons: TrackedSeason[] } | null>(null);
  useEffect(() => {
    if (last === null) return;
    let live = true;
    const read = <T,>(rel: string) => fetch(`/api/state/leagues/fba/${rel}`).then(res => (res.ok ? res.json() as Promise<T> : null), () => null);
    const numbers = Array.from({ length: Math.max(0, last - STREAK_TRACKING_START + 1) }, (_, i) => STREAK_TRACKING_START + i);
    Promise.all(numbers.map(async season => {
      const [results, playoffs] = await Promise.all([read<ResultsFile>(`S${season}/results.json`), read<PlayoffsFile>(`S${season}/playoffs.json`)]);
      return { season, regular: results?.games ?? [], playoffs: playoffs?.games ?? [] };
    })).then(seasons => { if (live) setState({ last, seasons }); });
    return () => { live = false; };
  }, [last]);
  return last !== null && state?.last === last ? state.seasons : null;
}

/** The name a franchise went by in a season, else the team's current name. */
const eraName = (franchises: FranchisesFile | null, team: Team | undefined, teamId: string, season: number): string => {
  const f: Franchise | undefined = franchises?.franchises.find(x => x.teamId === teamId);
  return f?.eras.find(e => e.from <= season && (e.to === null || season <= e.to))?.name ?? team?.name ?? teamId;
};

function TeamCell({ entry, teams, franchises }: { entry: { teamId: string; name: string | null; toSeason: number }; teams: Team[]; franchises: FranchisesFile | null }) {
  const team = teams.find(t => t.teamId === entry.teamId);
  const name = entry.name ?? eraName(franchises, team, entry.teamId, entry.toSeason);
  return team ? <TeamName team={team} season={entry.toSeason} name={name} to={`/history/fba/teams/${team.teamId}`} /> : <>{name}</>;
}

function StreakTable({ title, entries, teams, franchises }: { title: string; entries: StreakEntry[]; teams: Team[]; franchises: FranchisesFile | null }) {
  return (
    <section className="stack">
      <h2 className="section-title">{title}</h2>
      <div className="table-wrap">
        <table className="stat-table">
          <thead><tr><th className="n">#</th><th>Team</th><th className="n">Games</th><th>Seasons</th><th></th></tr></thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={`${e.teamId}-${e.fromSeason}-${e.length}-${i}`}>
                <td className="n">{e.rank}</td>
                <td><TeamCell entry={e} teams={teams} franchises={franchises} /></td>
                <td className="n"><b>{e.length}</b></td>
                <td>{seasonSpan(e.fromSeason, e.toSeason)}</td>
                <td className="muted">
                  {e.active && <Badge kind="live">Active</Badge>}
                  {e.playoffGames > 0 && <span> {e.active ? '· ' : ''}includes {e.playoffGames} playoff {e.playoffGames === 1 ? 'game' : 'games'}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The longest winning and losing streaks in the league's history: recorded by hand before S79, tracked game by game (playoffs included) since. */
export function StreaksPage() {
  const meta = useDoc<MetaFile>('meta.json');
  const records = useDoc<StreakRecordsFile>('leagues/fba/streakRecords.json');
  const { settled, teams, franchises } = useFbaTeams();
  const tracked = useTrackedSeasons(meta.data ? meta.data.currentSeason : null);
  const failure = meta.error ?? docFailure(records);
  if (failure) return <p className="error">Couldn't load the streaks: {failure.message}</p>;
  if (!settled || !docSettled(meta) || !docSettled(records) || (meta.data && tracked === null)) return <p className="muted">Loading…</p>;

  const runs: StreakRun[] = tracked ? trackStreaks(tracked) : [];
  const recorded = records.data?.records ?? [];
  const active = currentStreaks(runs).filter(r => r.length >= ACTIVE_MIN);
  return (
    <section className="stack">
      <PageHeader kicker="FBA history" title="Streaks" />
      <p className="muted">
        Streaks from S{STREAK_TRACKING_START} on are tracked game by game, playoffs included, and carry across seasons. Earlier streaks are the league&apos;s
        records, entered by hand.
      </p>
      {active.length > 0 && (
        <div>
          <h2 className="section-title">Current streaks</h2>
          <ul className="chips">
            {active.map(r => {
              const team = teams.find(t => t.teamId === r.teamId);
              return <li key={r.teamId} className="chip">{team?.abbr ?? r.teamId} {r.kind}{r.length}</li>;
            })}
          </ul>
        </div>
      )}
      <StreakTable title="Longest winning streaks" entries={allTimeStreaks(recorded, runs, 'W', LIST_SIZE)} teams={teams} franchises={franchises} />
      <StreakTable title="Longest losing streaks" entries={allTimeStreaks(recorded, runs, 'L', LIST_SIZE)} teams={teams} franchises={franchises} />
    </section>
  );
}
