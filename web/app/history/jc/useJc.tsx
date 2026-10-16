import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { JcRecruitingHistoryFile, JcSchoolHistoryFile, MetaFile, PlayersFile, RecruitingFile, ResultsFile, RostersFile, Team, TeamsFile } from '../../../engine/shared/types';
import { getDoc, useDoc } from '../../api';
import { TeamName } from '../../components/TeamName';
import { findTeam } from '../useTeams';

/** The FBAJC teams, for decoration only: a missing or unreadable doc means plain text instead of logos, never an error page. */
export function useJcTeams(): { settled: boolean; teams: Team[] } {
  const doc = useDoc<TeamsFile>('leagues/fbajc/teams.json');
  return { settled: !!doc.data || doc.missing || !!doc.error, teams: doc.data?.teams ?? [] };
}

/** The imported school history (S1-S78). It is optional: a league without it still shows what the season summaries give. */
export function useJcSchoolHistory(): { settled: boolean; file: JcSchoolHistoryFile | null } {
  const doc = useDoc<JcSchoolHistoryFile>('leagues/fbajc/schoolHistory.json');
  return { settled: !!doc.data || doc.missing || !!doc.error, file: doc.data ?? null };
}

/**
 * The recruiting boards the app ran after the imported history (seasons `through` to the current one); a missing or unreadable board is skipped.
 * `settled` is false until every board has been tried.
 */
export function useJcLiveBoards(through: number | null): { settled: boolean; boards: RecruitingFile[]; current: number } {
  const meta = useDoc<MetaFile>('meta.json');
  const current = meta.data?.currentSeason;
  const [state, setState] = useState<{ key: string; boards: RecruitingFile[] } | null>(null);
  const key = through !== null && current !== undefined ? `${through}-${current}` : null;
  useEffect(() => {
    if (through === null || current === undefined || key === null) return;
    let live = true;
    const seasons = Array.from({ length: Math.max(0, current - through + 1) }, (_, k) => through + k);
    void Promise.all(seasons.map(n => getDoc<RecruitingFile>(`leagues/fbajc/S${n}/recruiting.json`).catch(() => null))).then(all => {
      if (live) setState({ key, boards: all.filter((b): b is RecruitingFile => b !== null) });
    });
    return () => { live = false; };
  }, [through, current, key]);
  if (through === null) return { settled: true, boards: [], current: 0 };
  return { settled: (meta.error !== undefined || meta.missing) || (key !== null && state?.key === key), boards: state?.key === key ? state.boards : [], current: current ?? 0 };
}

/** The imported recruiting classes and transfer portals (S52-S78). Optional, like the school history. */
export function useJcRecruitingHistory(): { settled: boolean; file: JcRecruitingHistoryFile | null } {
  const doc = useDoc<JcRecruitingHistoryFile>('leagues/fbajc/recruitingHistory.json');
  return { settled: !!doc.data || doc.missing || !!doc.error, file: doc.data ?? null };
}

/** A college school linked to its history page when known (by id, else exact name), else the bare name. */
export function JcTeam({ teams, teamId, name, season, size }: {
  teams: Team[]; teamId?: string | null; name: string; season: number; size?: number;
}) {
  const team = findTeam(teams, teamId, name);
  return team
    ? <TeamName team={team} season={season} size={size ?? 20} to={`/history/fbajc/schools/${team.teamId}`} />
    : <>{name}</>;
}

/** A player as the college history records him: linked to his history page when matched to a player, else the sheet's name as text. */
export function JcPerson({ id, name, players }: { id: string | null | undefined; name?: string | null; players: PlayersFile }) {
  if (id) return <Link to={`/history/fba/players/${id}`}>{players.players[id]?.name ?? name ?? id}</Link>;
  return <>{name ?? '—'}</>;
}

/** The FBAJC season roster files from S78 (the first with full rosters) through `latest`, and the games of `latest`, once the Players tab asks for them. */
export function useJcSeasonFiles(latest: number | null): { rosters: RostersFile[]; results: ResultsFile | null } | null {
  const [state, setState] = useState<{ latest: number; rosters: RostersFile[]; results: ResultsFile | null } | null>(null);
  useEffect(() => {
    if (latest === null) return;
    let live = true;
    const read = <T,>(rel: string) => fetch(`/api/state/leagues/fbajc/${rel}`).then(res => (res.ok ? res.json() as Promise<T> : null), () => null);
    const seasons = Array.from({ length: Math.max(0, latest - 77) }, (_, i) => 78 + i);
    Promise.all([Promise.all(seasons.map(n => read<RostersFile>(`S${n}/rosters.json`))), read<ResultsFile>(`S${latest}/results.json`)])
      .then(([files, results]) => { if (live) setState({ latest, rosters: files.filter((f): f is RostersFile => f !== null), results }); });
    return () => { live = false; };
  }, [latest]);
  return latest !== null && state?.latest === latest ? state : null;
}
