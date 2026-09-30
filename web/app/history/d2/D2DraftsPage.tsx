import { Link } from 'react-router-dom';
import type { D2DraftHistoryFile } from '../../../engine/shared/types';
import { docFailure, useDoc } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { HistoryLeagueSwitch } from './HistoryLeagueSwitch';
import '../history.css';

export function D2DraftsPage() {
  const doc = useDoc<D2DraftHistoryFile>('leagues/fbad2/draftHistory.json');
  const failure = docFailure(doc);
  if (failure) return <p className="error">Couldn't load the drafts: {failure.message}</p>;
  if (!doc.data && !doc.missing) return <p className="muted">Loading…</p>;
  const seasons = (doc.data?.drafts ?? []).map(d => d.season).sort((a, b) => b - a);
  return (
    <section className="stack">
      <PageHeader kicker="FBAD2" title="Drafts" />
      <HistoryLeagueSwitch />
      {!doc.data && <p className="muted">No D2 draft history yet. Run npm run import -- --d2-history --data data.</p>}
      <ul className="chips">
        {seasons.map(s => <li key={s}><Link className="chip" to={`/history/fbad2/drafts/${s}`}>S{s}</Link></li>)}
      </ul>
    </section>
  );
}
