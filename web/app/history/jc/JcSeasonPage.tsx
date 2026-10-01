import { Link, useNavigate, useParams } from 'react-router-dom';
import { isJcNationalTitle, isJcNitTitle, jcSeasonLabel } from '../../../engine/history/jc';
import { formatScore } from '../../../engine/history/format';
import { NATIONAL_LABEL } from '../../../engine/jc/awards';
import { groupLabel } from '../../../engine/shared/leagues';
import type { Champion, PlayersFile, SummaryFile, Team } from '../../../engine/shared/types';
import { useDoc, useHistory } from '../../api';
import { Badge } from '../../components/Badge';
import { Hero } from '../../components/Hero';
import { PastBracket } from '../PastBracket';
import { SkippedWarning } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from '../d2/HistoryLeagueSwitch';
import { JcPerson, JcTeam, useJcTeams } from './useJc';

type Who = { playerId: string | null; teamId?: string | null; name?: string; school?: string | null };

function Entry({ w, teams, players, season }: { w: Who; teams: Team[]; players: PlayersFile; season: number }) {
  const school = w.school ?? w.teamId;
  return (
    <>
      <JcPerson id={w.playerId} name={w.name} players={players} />
      {school && <> (<JcTeam teams={teams} teamId={w.teamId} name={school} season={season} size={16} />)</>}
    </>
  );
}

function Title({ c, label, teams, players, season }: { c: Champion; label: string; teams: Team[]; players: PlayersFile; season: number }) {
  return (
    <li>
      <b>{label}</b> <JcTeam teams={teams} teamId={c.teamId} name={c.champion} season={season} /> over{' '}
      {c.runnerUp ? <JcTeam teams={teams} teamId={c.runnerUpId} name={c.runnerUp} season={season} /> : '—'}
      {c.score && <span className="muted"> {formatScore(c.score)}</span>}
      {(c.finalsMvp || c.mvpName) && <> <Badge kind="finals-mvp">C-Ship MVP <JcPerson id={c.finalsMvp} name={c.mvpName} players={players} /></Badge></>}
    </li>
  );
}

function Sections({ season, teams, players }: { season: SummaryFile; teams: Team[]; players: PlayersFile }) {
  const n = season.season;
  const jc = season.jc;
  const national = season.champions.find(c => isJcNationalTitle(c.title));
  const nit = season.champions.find(c => isJcNitTitle(c.title));
  const aaLegacy = jc?.allAmericanLegacy?.teams ?? [];
  return (
    <>
      {(national || nit) && (
        <div>
          <h2 className="section-title">Champions</h2>
          <ul className="plain-list">
            {national && <Title c={national} label="National Champion" teams={teams} players={players} season={n} />}
            {nit && <Title c={nit} label="NIT Champion" teams={teams} players={players} season={n} />}
          </ul>
        </div>
      )}
      {jc && jc.national.length > 0 && (
        <div>
          <h2 className="section-title">National awards</h2>
          <ul className="plain-list">
            {jc.national.map((a, i) => <li key={i}>{NATIONAL_LABEL[a.award]}: <Entry w={a} teams={teams} players={players} season={n} /></li>)}
          </ul>
        </div>
      )}
      {jc?.allAmerican && jc.allAmerican.length > 0 && (
        <div>
          <h2 className="section-title">All-Americans</h2>
          {jc.allAmerican.map(t => (
            <div key={t.team}>
              <h3>Team {t.team}</h3>
              <ul className="plain-list">
                {t.slots.map((sl, i) => <li key={i}><span className="muted">{sl.slot}</span> <Entry w={sl} teams={teams} players={players} season={n} /></li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
      {aaLegacy.length > 0 && (
        <div>
          <h2 className="section-title">All-Americans</h2>
          {aaLegacy.map(t => (
            <div key={t.team}>
              {(aaLegacy.length > 1 || t.team > 1) && <h3>Team {t.team}</h3>}
              <ul className="plain-list">
                {t.slots.map((sl, i) => <li key={i}><span className="muted">{sl.slot}</span> <Entry w={sl} teams={teams} players={players} season={n} /></li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
      {jc && jc.confChampions.length > 0 && (
        <div>
          <h2 className="section-title">Conference champions</h2>
          <div className="table-wrap">
            <table className="stat-table">
              <thead><tr><th>Conference</th><th>Regular season</th><th>Tournament</th></tr></thead>
              <tbody>
                {jc.confChampions.map(c => (
                  <tr key={c.conf}>
                    <td>{groupLabel('fbajc', c.conf)}</td>
                    <td>
                      {c.regularSeason.length === 0 ? '—' : c.regularSeason.map((id, i) => (
                        <span key={i}>{i > 0 && ', '}<JcTeam teams={teams} teamId={id} name={id} season={n} size={16} />{c.regularSeasonRecords?.[i] && <span className="muted"> ({c.regularSeasonRecords[i]})</span>}</span>
                      ))}
                    </td>
                    <td>{c.tournament ? <JcTeam teams={teams} teamId={c.tournament} name={c.tournament} season={n} size={16} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {jc && jc.conference.length > 0 && (
        <div>
          <h2 className="section-title">Conference awards</h2>
          <ul className="plain-list">
            {jc.conference.map((a, i) => <li key={i}>{groupLabel('fbajc', a.conf)}: <Entry w={a} teams={teams} players={players} season={n} /></li>)}
          </ul>
        </div>
      )}
      {jc?.preseason && jc.preseason.length > 0 && (
        <div>
          <h2 className="section-title">Preseason tournaments</h2>
          <ul className="plain-list">
            {jc.preseason.map((p, i) => <li key={i}>{p.event}: <JcTeam teams={teams} teamId={p.teamId} name={p.champion} season={n} size={16} /></li>)}
          </ul>
        </div>
      )}
    </>
  );
}

export function JcSeasonPage() {
  const { season: param = '' } = useParams();
  const navigate = useNavigate();
  const { seasons, errors, error } = useHistory('fbajc');
  const players = useDoc<PlayersFile>('players.json');
  const { settled, teams } = useJcTeams();
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !settled) return <p className="muted">Loading…</p>;
  const n = /^\d+$/.test(param) ? Number(param) : NaN;
  const season = seasons.find(s => s.season === n);
  if (!season) return <p className="muted">Not found</p>;
  const ordered = [...seasons].sort((a, b) => b.season - a.season);
  const idx = ordered.findIndex(s => s.season === n);
  const next = idx > 0 ? ordered[idx - 1].season : undefined;
  const prev = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1].season : undefined;
  const mm = season.pastBracket;
  const nitBracket = season.jc?.nitBracket;
  const early = n <= 18 ? 'Season of the junior-college era.' : null;
  return (
    <section className="stack">
      <Hero kicker={`Season ${n}`} title={`${jcSeasonLabel(n)} college season`} />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      {early && <p className="muted">{early}</p>}
      <label>
        Season{' '}
        <select aria-label="Season" value={n} onChange={e => navigate(`/history/fbajc/season/${e.target.value}`)}>
          {ordered.map(s => <option key={s.season} value={s.season}>S{s.season}</option>)}
        </select>
      </label>
      <div className="chips">
        {prev !== undefined && <Link to={`/history/fbajc/season/${prev}`}>← S{prev}</Link>}
        {next !== undefined && <Link to={`/history/fbajc/season/${next}`}>S{next} →</Link>}
      </div>
      <Sections season={season} teams={teams} players={players.data} />
      <div className="stack">
        <h2 className="section-title">March Madness</h2>
        {mm ? <PastBracket bracket={mm} teams={teams} season={n} showRecords /> : <p className="muted">No bracket recorded</p>}
      </div>
      {(nitBracket || season.champions.some(c => isJcNitTitle(c.title))) && (
        <div className="stack">
          <h2 className="section-title">NIT</h2>
          {nitBracket ? <PastBracket bracket={nitBracket} teams={teams} season={n} showRecords /> : <p className="muted">No bracket recorded</p>}
        </div>
      )}
    </section>
  );
}
