import type { Champion, FranchisesFile, SummaryFile, Team } from '../../engine/shared/types';
import { ChampBadge, SideRow } from '../playoffs/Bracket';
import { TeamFull } from './useTeams';

/** Wins from a series score such as "4–1" or "2-0", winner first; null when the score can't be read. */
export function finalsWins(score: string | null | undefined): [number, number] | null {
  const m = (score ?? '').match(/^\s*(\d+)\s*[–-]\s*(\d+)\s*$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** The Finals of a season with no recorded bracket, drawn as the Finals box of a bracket. */
export function FinalsCard({ champion, conf, teams, franchises, season }: {
  champion: Champion; conf: SummaryFile['confChampions']; teams: Team[]; franchises: FranchisesFile | null; season: number;
}) {
  const wins = finalsWins(champion.score);
  const confOf = (name: string | null) => (!name || !conf ? null : conf.E === name ? 'E' : conf.W === name ? 'W' : null);
  const row = (name: string | null, teamId: string | undefined, w: number | null, won: boolean) => (
    <SideRow
      seed={confOf(name)}
      name={name ? <TeamFull teams={teams} franchises={franchises} teamId={teamId} name={name} season={season} size={20} /> : '—'}
      wins={w}
      won={won}
    />
  );
  return (
    <div className="stack">
      <p className="muted">The full bracket for S{season} wasn't recorded.</p>
      <div className="finals-only">
        <div className="series-box finals decided">
          <ChampBadge />
          {row(champion.champion, champion.teamId, wins ? wins[0] : null, true)}
          {row(champion.runnerUp, champion.runnerUpId, wins ? wins[1] : null, false)}
        </div>
      </div>
    </div>
  );
}
