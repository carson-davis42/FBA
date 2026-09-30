import { Link } from 'react-router-dom';
import type { DraftFile, DraftHistoryFile, MetaFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import './history.css';

function AppDraftChip({ season }: { season: number }) {
  const doc = useDoc<DraftFile>(`leagues/fba/S${season}/draft.json`);
  if (!doc.data || !doc.data.started) return null;
  return <li><Link className="chip" to={`/history/fba/drafts/${season}`}>S{season}</Link></li>;
}

export function DraftsPage() {
  const history = useDoc<DraftHistoryFile>('leagues/fba/draftHistory.json');
  const meta = useDoc<MetaFile>('meta.json');
  if (history.error && !history.missing) return <p className="error">Couldn't load the drafts: {history.error.message}</p>;
  if ((!history.data && !history.missing) || (!meta.data && !meta.missing && !meta.error)) return <p className="muted">Loading…</p>;

  const drafts = history.data?.drafts ?? [];
  const imported = [...new Set(drafts.map(d => d.season))].sort((a, b) => b - a);
  const expansions = new Set(drafts.filter(d => d.kind === 'expansion').map(d => d.season));
  const appSeasons: number[] = [];
  for (let s = (meta.data?.currentSeason ?? 79) + 1; s >= 80; s--) if (!imported.includes(s)) appSeasons.push(s);

  return (
    <section className="stack">
      <PageHeader kicker="FBA" title="Drafts" />
      {!history.data && <p className="muted">No draft history yet. Run npm run import -- --drafts --data data.</p>}
      <ul className="chips">
        {appSeasons.map(s => <AppDraftChip key={s} season={s} />)}
        {imported.map(s => (
          <li key={s}><Link className="chip" to={`/history/fba/drafts/${s}`}>S{s}{expansions.has(s) ? ' + Exp.' : ''}</Link></li>
        ))}
      </ul>
    </section>
  );
}
