import { Link, useParams } from 'react-router-dom';
import { trophyCase, TROPHY_AWARDS } from '../../engine/history/trophies';
import type { DraftHistoryFile, Franchise, HallOfFameFile, LogoManifest, PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { Hero } from '../components/Hero';
import { teamTheme } from '../components/teamColors';
import { TeamMark } from '../components/TeamMark';
import { EraStrip } from './EraStrip';
import { PlayerLink } from './PlayerLink';
import { useFbaTeams } from './useTeams';
import './history.css';

const settledDoc = (d: { data?: unknown; missing: boolean; error?: unknown }) => !!d.data || d.missing || !!d.error;

export function FranchisePage() {
  const { teamId = '' } = useParams();
  const { seasons, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const hof = useDoc<HallOfFameFile>('leagues/fba/hallOfFame.json');
  const drafts = useDoc<DraftHistoryFile>('leagues/fba/draftHistory.json');
  const manifest = useDoc<LogoManifest>('logos/manifest.json');
  const { settled, teams, franchises } = useFbaTeams();
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !settled || !settledDoc(hof) || !settledDoc(drafts) || !settledDoc(manifest)) return <p className="muted">Loading…</p>;

  const playerDoc: PlayersFile = players.data;
  const team = teams.find(t => t.teamId === teamId);
  const franchise: Franchise | undefined = franchises?.franchises.find(f => f.teamId === teamId)
    ?? (team ? { teamId, eras: [{ name: team.name, abbr: team.abbr, city: '', from: 1, to: null }] } : undefined);
  if (!franchise) return <p className="error">Unknown franchise "{teamId}".</p>;

  const latest = seasons.length > 0 ? seasons.reduce((m, s) => Math.max(m, s.season), 0) : 79;
  const c = trophyCase(teamId, { summaries: seasons, teams, franchises, hallOfFame: hof.data ?? null });
  const name = team?.name ?? franchise.eras[0].name;
  const chips = (title: string, list: number[]) => (
    <div>
      <h2 className="section-title">{title}</h2>
      {list.length === 0 ? <p className="muted">None yet</p> : (
        <ul className="chips">
          {list.map(n => <li key={n}><Link className="chip" to={`/history/fba/season/${n}`}>S{n}</Link></li>)}
        </ul>
      )}
    </div>
  );
  const awardRows = TROPHY_AWARDS.map(a => ({ award: a, wins: c.awards.filter(x => x.award === a) })).filter(r => r.wins.length > 0);
  const picks = (drafts.data?.drafts ?? [])
    .flatMap(d => d.picks.filter(p => p.teamId === teamId).map(p => ({ ...p, season: d.season, kind: d.kind })))
    .sort((a, b) => b.season - a.season || (a.pick ?? Infinity) - (b.pick ?? Infinity));

  return (
    <section className="stack">
      <Hero
        theme={team ? teamTheme(team, 'fba') : undefined}
        logo={team ? <TeamMark team={team} season={latest} size={96} /> : undefined}
        kicker="FBA franchise"
        title={name}
        stats={[
          { label: 'Titles', value: c.championships.length },
          { label: 'Finals', value: c.finals.length },
          { label: 'Conf. titles', value: c.confTitles.length },
          { label: 'Tournaments', value: c.tournaments.length },
        ]}
      />
      <EraStrip franchise={franchise} team={team} manifest={manifest.data ?? null} />
      {chips('Championships', c.championships)}
      {chips('Finals appearances', c.finals)}
      {chips('Conference titles', c.confTitles)}
      {chips('Tournament appearances', c.tournaments)}
      <div>
        <h2 className="section-title">Awards</h2>
        {awardRows.length === 0 ? <p className="muted">None yet</p> : (
          <ul className="plain-list">
            {awardRows.map(r => (
              <li key={r.award}>
                <b>{r.award}</b>{' '}
                {r.wins.map((w, i) => (
                  <span key={`${w.playerId}-${w.season}`}>{i > 0 && ', '}<PlayerLink id={w.playerId} players={playerDoc} /> (S{w.season})</span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h2 className="section-title">Hall of Famers</h2>
        {c.hallOfFamers.length === 0 ? <p className="muted">None yet</p> : (
          <ul className="plain-list">
            {c.hallOfFamers.map(h => (
              <li key={`${h.season}-${h.name}`}>
                {h.playerId ? <PlayerLink id={h.playerId} players={playerDoc} /> : h.name} <span className="muted">{h.season}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {picks.length > 0 && (
        <div>
          <h2 className="section-title">Draft picks</h2>
          <div className="table-wrap">
            <table className="stat-table">
              <thead><tr><th>Season</th><th className="n">Pick</th><th>Player</th><th>Pos</th><th>College</th></tr></thead>
              <tbody>
                {picks.map((p, i) => (
                  <tr key={`${p.season}-${p.kind}-${i}`}>
                    <td>S{p.season}</td>
                    <td className="n">{p.kind === 'expansion' ? 'Exp.' : p.pick ?? '—'}</td>
                    <td>{p.playerId ? <PlayerLink id={p.playerId} players={playerDoc} /> : p.name}</td>
                    <td>{p.pos}</td>
                    <td>{p.college ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p><Link to={`/history/fba/transactions?team=${teamId}`}>Transactions →</Link></p>
    </section>
  );
}
