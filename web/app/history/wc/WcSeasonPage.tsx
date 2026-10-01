import { useParams } from 'react-router-dom';
import { wcTitleRows } from '../../../engine/history/wc';
import type { PlayersFile, WcHostsFile } from '../../../engine/shared/types';
import { useDoc, useHistory } from '../../api';
import { Badge } from '../../components/Badge';
import { PageHeader } from '../../components/PageHeader';
import { HistoryLeagueSwitch } from '../d2/HistoryLeagueSwitch';
import { PastBracket } from '../PastBracket';
import { PlayerLink, SkippedWarning } from '../PlayerLink';
import '../history.css';
import { useWcTeams, WcTeam } from './useWc';

export function WcSeasonPage() {
  const { season: param = '' } = useParams();
  const { seasons, errors, error } = useHistory('fbawc');
  const players = useDoc<PlayersFile>('players.json');
  const { settled, teams } = useWcTeams();
  const hostsDoc = useDoc<WcHostsFile>('leagues/fbawc/hosts.json');
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  const hostsSettled = !!hostsDoc.data || hostsDoc.missing || !!hostsDoc.error;
  if (!seasons || !players.data || !settled || !hostsSettled) return <p className="muted">Loading…</p>;
  const n = /^\d+$/.test(param) ? Number(param) : NaN;
  const summary = seasons.find(s => s.season === n);
  const hostEntry = (hostsDoc.data?.hosts ?? []).find(h => h.season === n);
  if (!summary && !hostEntry) return <p className="muted">Not found</p>;
  const hostText = hostEntry ? `${hostEntry.city}, ${hostEntry.country}` : summary?.host ?? null;
  const head = (
    <>
      <PageHeader kicker="World Cup" title={`S${n} World Cup`} />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      {hostText && <p>Host: {hostText}</p>}
    </>
  );
  if (!summary) {
    return <section className="stack">{head}<p className="muted">Not played yet</p></section>;
  }
  const row = wcTitleRows([summary])[0];
  return (
    <section className="stack">
      {head}
      {row && (
        <ul className="plain-list">
          <li><b>Champion</b> <WcTeam teams={teams} teamId={row.championId} name={row.champion} season={n} /></li>
          <li><b>Runner-up</b> {row.runnerUp ? <WcTeam teams={teams} teamId={row.runnerUpId} name={row.runnerUp} season={n} /> : '—'}</li>
          <li><b>Tournament MVP</b> {row.mvp ? <Badge kind="finals-mvp"><PlayerLink id={row.mvp} players={players.data} /></Badge> : row.mvpName ?? '—'}</li>
        </ul>
      )}
      <div>
        <h2 className="section-title">Bracket</h2>
        {summary.pastBracket
          ? <PastBracket bracket={summary.pastBracket} teams={teams} season={n} />
          : <p className="muted">No bracket recorded</p>}
      </div>
    </section>
  );
}
