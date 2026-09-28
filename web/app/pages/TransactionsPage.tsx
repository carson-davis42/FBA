import { useParams } from 'react-router-dom';
import { isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { MetaFile, TransactionsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { LeagueTabs } from '../components/LeagueTabs';
import './roster.css';

export function TransactionsPage() {
  const { league = '' } = useParams();
  const valid = isLeagueId(league);
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: tx, error } = useDoc<TransactionsFile>(valid && meta ? `leagues/${league}/S${meta.currentSeason}/transactions.json` : null);
  if (!valid) return <p className="error">Unknown league "{league}".</p>;
  if (error) return <p className="muted">No transactions yet this season.</p>;
  if (!tx) return <p className="muted">Loading…</p>;
  return (
    <section>
      <h1>{LEAGUE_LABEL[league]} transactions · S{tx.season}</h1>
      <LeagueTabs league={league} />
      {tx.entries.length === 0 && <p className="muted">No moves yet.</p>}
      <ul className="tx-list">
        {[...tx.entries].reverse().map(e => (
          <li key={e.seq}>
            <b>{e.teams.join('/') || 'League'}</b> <span className="tag">{e.type}</span>
            {e.lines.map(l => <div key={l}>{l}</div>)}
          </li>
        ))}
      </ul>
    </section>
  );
}
