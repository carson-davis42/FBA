import { Link, useParams } from 'react-router-dom';
import type { D2DraftHistoryFile, PlayersFile } from '../../../engine/shared/types';
import { docFailure, useDoc } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { HistoryLeagueSwitch } from './HistoryLeagueSwitch';
import { PlayerLink } from '../PlayerLink';
import { D2Team, useD2Teams } from './useD2';
import '../history.css';

export function D2DraftSeasonPage() {
  const { season: seasonParam = '' } = useParams();
  const season = Number(seasonParam);
  const players = useDoc<PlayersFile>('players.json');
  const doc = useDoc<D2DraftHistoryFile>('leagues/fbad2/draftHistory.json');
  const d2 = useD2Teams();
  const failure = players.error ?? docFailure(doc);
  if (failure) return <p className="error">Couldn't load the draft: {failure.message}</p>;
  if (!players.data || (!doc.data && !doc.missing) || !d2.settled) return <p className="muted">Loading…</p>;

  const all = (doc.data?.drafts ?? []).map(d => d.season).sort((a, b) => a - b);
  const draft = doc.data?.drafts.find(d => d.season === season);
  if (!draft) return <p className="muted">Not found</p>;
  const prev = all.filter(s => s < season).pop();
  const next = all.find(s => s > season);
  const actions = (
    <>
      {prev !== undefined && <Link to={`/history/fbad2/drafts/${prev}`}>← S{prev}</Link>}
      <Link to="/history/fbad2/drafts">Drafts</Link>
      {next !== undefined && <Link to={`/history/fbad2/drafts/${next}`}>S{next} →</Link>}
    </>
  );
  return (
    <section className="stack">
      <PageHeader kicker="FBAD2 drafts" title={`S${season} D2 Draft`} actions={actions} />
      <HistoryLeagueSwitch />
      <div className="table-wrap">
        <table className="stat-table">
          <thead><tr><th className="n">Pick</th><th>Team</th><th>Player</th><th>Pos</th><th className="n">Age</th><th className="n">Rating</th></tr></thead>
          <tbody>
            {draft.picks.map(p => (
              <tr key={p.pick}>
                <td className="n">{p.pick}</td>
                <td><D2Team teams={d2.teams} teamId={p.teamId} name={p.teamName} season={season} size={16} /></td>
                <td>{p.playerId ? <PlayerLink id={p.playerId} players={players.data!} /> : p.name}</td>
                <td>{p.pos}</td>
                <td className="n">{p.age ?? '—'}</td>
                <td className="n">{p.rating ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
