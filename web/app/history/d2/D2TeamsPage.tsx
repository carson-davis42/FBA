import { Link } from 'react-router-dom';
import { d2TitleRows } from '../../../engine/history/d2';
import { groupLabel } from '../../../engine/shared/leagues';
import type { MetaFile } from '../../../engine/shared/types';
import { docFailure, docSettled, useDoc, useHistory } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { TeamName } from '../../components/TeamName';
import '../history.css';
import { HistoryLeagueSwitch } from './HistoryLeagueSwitch';
import { useD2Teams } from './useD2';

const GROUPS = ['PL', 'WL', 'UL', 'IL'];

export function D2TeamsPage() {
  const { seasons, error } = useHistory('fbad2');
  const meta = useDoc<MetaFile>('meta.json');
  const { settled, teams } = useD2Teams();
  const failure = error ?? docFailure(meta);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !settled || !docSettled(meta)) return <p className="muted">Loading…</p>;
  const rows = d2TitleRows(seasons);
  const titles = (t: { teamId: string; name: string }) => rows.filter(r => r.teamId === t.teamId || r.champion === t.name).length;
  const latest = meta.data?.currentSeason ?? 79;
  return (
    <section className="stack">
      <PageHeader kicker="FBAD2 history" title="Teams" />
      <HistoryLeagueSwitch />
      {GROUPS.map(g => (
        <div key={g}>
          <h2 className="section-title">{groupLabel('fbad2', g)}</h2>
          <div className="card-grid">
            {teams.filter(t => t.group === g).sort((a, b) => a.name.localeCompare(b.name)).map(t => {
              const n = titles(t);
              return (
                <Link key={t.teamId} className="card link" to={`/history/fbad2/teams/${t.teamId}`}>
                  <TeamName team={t} season={latest} size={40} />
                  <div className="muted">{n} {n === 1 ? 'title' : 'titles'}</div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
