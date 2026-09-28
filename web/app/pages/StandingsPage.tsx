import { useParams } from 'react-router-dom';
import { PLAYOFF_SEEDS, standings, type StandingRow } from '../../engine/season/standings';
import { groupLabel, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { Team } from '../../engine/shared/types';
import { LeagueTabs } from '../components/LeagueTabs';
import { TeamMark } from '../components/TeamMark';
import { useSeasonState } from '../season/useSeasonState';
import './season.css';

const pct = (x: number) => (x === 1 ? '1.000' : x.toFixed(3).replace(/^0/, ''));
const gb = (x: number) => (x === 0 ? '—' : String(x));
const signed = (x: number) => (x > 0 ? `+${x}` : String(x));

function Table({ rows, teams, season, showConf, lottery }: { rows: StandingRow[]; teams: Map<string, Team>; season: number; showConf: boolean; lottery?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="standings">
        <thead>
          <tr>
            <th>{lottery ? 'Pick' : '#'}</th><th></th><th>Team</th><th className="n">W</th><th className="n">L</th><th className="n">PCT</th>
            {!lottery && <th className="n">GB</th>}
            {showConf && !lottery && <th className="n">CONF</th>}
            {!lottery && <><th className="n">L10</th><th className="n">STRK</th><th className="n">DIFF</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const t = teams.get(r.teamId);
            return (
              <tr key={r.teamId} className={!lottery && r.seed === PLAYOFF_SEEDS ? 'playoff-line' : undefined}>
                <td>{r.seed}</td>
                <td className="marker">{r.marker ?? ''}</td>
                <td>{t && <TeamMark team={t} season={season} size={20} />} {t?.name ?? r.teamId}</td>
                <td className="n">{r.w}</td><td className="n">{r.l}</td><td className="n">{pct(r.pct)}</td>
                {!lottery && <td className="n">{gb(r.gb)}</td>}
                {showConf && !lottery && <td className="n">{r.confW}-{r.confL}</td>}
                {!lottery && <><td className="n">{r.l10}</td><td className="n">{r.streak}</td><td className="n">{signed(r.diff)}</td></>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StandingsPage() {
  const { league = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state, error } = useSeasonState(lg);
  if (!lg) return <p className="error">Standings are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const teams = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const s = standings(lg, state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), state.results?.games ?? []);
  return (
    <section>
      <h1>{LEAGUE_LABEL[lg]} standings · S{state.season}</h1>
      <LeagueTabs league={lg} />
      {lg === 'fba' && <p className="muted">* clinched the #1 seed · x clinched a playoff spot · n eliminated</p>}
      {s.groups.map(g => (
        <div key={g.group}>
          <h2>{groupLabel(lg, g.group)}</h2>
          <Table rows={g.rows} teams={teams} season={state.season} showConf={lg === 'fba'} />
        </div>
      ))}
      {lg === 'fba' && s.lottery.length > 0 && (
        <div>
          <h2>Lottery standings</h2>
          <Table rows={s.lottery} teams={teams} season={state.season} showConf={false} lottery />
        </div>
      )}
    </section>
  );
}
