import { useParams } from 'react-router-dom';
import { isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { MetaFile, PlayersFile, TeamsFile, TransactionsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { linkTransactionLine, uniqueNameIndex } from '../components/LinkedPlayers';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import './roster.css';

export function TransactionsPage() {
  const { league = '' } = useParams();
  const valid = isLeagueId(league);
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: tx, error } = useDoc<TransactionsFile>(valid && meta ? `leagues/${league}/S${meta.currentSeason}/transactions.json` : null);
  const { data: teams } = useDoc<TeamsFile>(valid ? `leagues/${league}/teams.json` : null);
  const { data: players } = useDoc<PlayersFile>(valid ? 'players.json' : null);
  if (!valid) return <p className="error">Unknown league "{league}".</p>;
  if (error) return <p className="muted">No transactions yet this season.</p>;
  if (!tx) return <p className="muted">Loading…</p>;
  const index = players ? uniqueNameIndex(players) : new Map<string, string>();
  return (
    <section>
      <PageHeader kicker={LEAGUE_LABEL[league]} title={`${LEAGUE_LABEL[league]} transactions · S${tx.season}`} />
      {tx.entries.length === 0 && <p className="muted">No moves yet.</p>}
      <ul className="tx-feed">
        {[...tx.entries].reverse().map(e => (
          <li key={e.seq} className="tx-row card">
            <div className="tx-rail" title={`Step ${e.seq}`}>#{e.seq}</div>
            <div className="tx-main">
              <div className="tx-head">
                {e.teams.length === 0 && <b>League</b>}
                {e.teams.map(id => {
                  const t = teams?.teams.find(x => x.teamId === id);
                  return t ? <TeamName key={id} team={t} season={tx.season} variant="abbr" size={20} to={`/league/${league}/team/${id}`} /> : <b key={id}>{id}</b>;
                })}
                <span className="badge">{e.type}</span>
              </div>
              {e.lines.map(l => <div key={l} className="tx-line">{linkTransactionLine(l, index)}</div>)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
